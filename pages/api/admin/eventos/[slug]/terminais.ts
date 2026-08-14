/**
 * GET /api/admin/eventos/[slug]/terminais
 *
 * Saúde do sync do evento: uma linha por terminal ALOCADO, para comparação lado
 * a lado. Quatro terminais com o mesmo total = saudável; um atrasado = aquele
 * device ficou fora do ar, e na feira isso significa "a pessoa passa numa
 * entrada e não na outra".
 *
 * `sincronizados` conta ESTADO DESEJADO REFLETIDO NO DEVICE — não "já foi
 * escrito alguma vez". Linhas em remoção não entram (ver o FILTER abaixo), de
 * modo que o total é conferível contra o `userNumber` real do equipamento.
 *
 * CUSTO: DUAS consultas, independente de haver 1 ou 4 terminais.
 *   1) os terminais alocados (poucas linhas);
 *   2) UM agregado com `count(*) FILTER`, agrupado por terminal.
 * Nada de N+1 — o gargalo aqui é round-trip ao Neon, não leitura de linha. A
 * agregação varre a tabela de propósito: ela QUER todas as linhas, e nesse caso
 * seq scan é mais barato que índice (por isso nenhum índice novo foi criado).
 *
 * Restrito a ADMIN_ROLES: OPERATOR não entra. Decisão explícita — a portaria
 * não tem ação possível com esta informação.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { MAX_ATTEMPTS } from '../../../../../lib/agent/retry-policy'

/** Heartbeat mais velho que isto acende alerta no terminal. */
export const HEARTBEAT_STALE_MS = 60 * 60 * 1000 // 1 hora

interface LinhaAgregada {
  terminalId: string
  sincronizados: bigint
  pendentes: bigint
  falhas: bigint
  mais_antigo_pendente: Date | null
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug ausente' })

  const event = await prisma.event.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, name: true, slug: true }
  })
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' })

  if (!hasEventPermission(session, event.slug, 'canView')) {
    return res.status(403).json({ error: 'Sem permissão neste evento' })
  }

  const agora = new Date()

  // ---------------------------------------------------------------- consulta 1
  // Terminais ALOCADOS a este evento. Sem recorte de período de propósito: um
  // terminal cuja alocação venceu precisa APARECER, porque "fora do período" é
  // justamente a explicação de por que ele parou de sincronizar.
  const alocacoes = await prisma.terminalEvent.findMany({
    where: { eventId: event.id, isActive: true },
    orderBy: { startDate: 'asc' },
    select: {
      startDate: true,
      endDate: true,
      terminal: {
        select: {
          id: true, name: true, ipAddress: true, port: true,
          isActive: true, lastSeenAt: true, lastError: true,
          deviceModel: true
        }
      }
    }
  })

  const terminalIds = [...new Set(alocacoes.map((a) => a.terminal.id))]

  // ---------------------------------------------------------------- consulta 2
  // Um único agregado condicional. `count(*) FILTER (WHERE ...)` faz todas as
  // contagens numa passada só; o "mais antigo" sai de graça como min(createdAt)
  // sobre exatamente os mesmos registros já contados como pendentes.
  let agregado: LinhaAgregada[] = []
  if (terminalIds.length > 0) {
    agregado = await prisma.$queryRaw<LinhaAgregada[]>`
      SELECT
        "terminalId",
        -- "sincronizados" = ESTADO DESEJADO REFLETIDO NO DEVICE. Por isso o
        -- recorte por removalState: aplicada a remoção, a linha continua com
        -- faceState='synced' (o campo não é revertido) e passaria a contar para
        -- sempre alguém que já saiu do terminal. Quem está marcado para remoção
        -- também não conta, mesmo com a face ainda fisicamente lá — essa linha
        -- já aparece na coluna de pendentes, que é onde ela deve ser cobrada.
        count(*) FILTER (WHERE "faceState"    = 'synced'
                          AND "removalState" = 'none')            AS sincronizados,
        count(*) FILTER (WHERE "faceState"    = 'pending'
                            OR "cardState"    = 'pending'
                            OR "removalState" = 'pending')        AS pendentes,
        count(*) FILTER (WHERE attempts >= ${MAX_ATTEMPTS}
                          AND ("faceState"    = 'failed'
                            OR "cardState"    = 'failed'
                            OR "removalState" = 'failed'))        AS falhas,
        min("createdAt") FILTER (WHERE "faceState"    = 'pending'
                                    OR "cardState"    = 'pending'
                                    OR "removalState" = 'pending') AS mais_antigo_pendente
      FROM participant_terminal_sync
      WHERE "terminalId" IN (${Prisma.join(terminalIds)})
      GROUP BY "terminalId"
    `
  }
  const porTerminal = new Map(agregado.map((r) => [r.terminalId, r]))

  // ------------------------------------------------------------------ montagem
  const terminais = alocacoes.map((a) => {
    const t = a.terminal
    const ag = porTerminal.get(t.id)
    const vigente = a.startDate <= agora && a.endDate >= agora
    const ultimoHeartbeat = t.lastSeenAt
    const heartbeatIdadeMs = ultimoHeartbeat ? agora.getTime() - ultimoHeartbeat.getTime() : null
    const maisAntigo = ag?.mais_antigo_pendente ?? null

    return {
      id: t.id,
      nome: t.name,
      ip: `${t.ipAddress}:${t.port}`,
      modelo: t.deviceModel,
      ativo: t.isActive,
      alocacao: {
        inicio: a.startDate.toISOString(),
        fim: a.endDate.toISOString(),
        vigente
      },
      heartbeat: {
        ultimo: ultimoHeartbeat ? ultimoHeartbeat.toISOString() : null,
        idadeMs: heartbeatIdadeMs,
        // null = nunca deu sinal. É o caso mais grave: silêncio absoluto.
        atrasado: heartbeatIdadeMs === null || heartbeatIdadeMs > HEARTBEAT_STALE_MS
      },
      ultimoErro: t.lastError,
      sincronizados: Number(ag?.sincronizados ?? 0),
      pendentes: Number(ag?.pendentes ?? 0),
      falhas: Number(ag?.falhas ?? 0),
      maisAntigoPendente: maisAntigo ? maisAntigo.toISOString() : null,
      maisAntigoPendenteMs: maisAntigo ? agora.getTime() - maisAntigo.getTime() : null
    }
  })

  // --------------------------------------------------------------- indicadores
  // Divergência entre terminais: é O sinal da tela. Todos com o mesmo total =
  // saudável; qualquer diferença aponta o device que ficou para trás.
  const totais = terminais.map((t) => t.sincronizados)
  const maiorTotal = totais.length ? Math.max(...totais) : 0
  const menorTotal = totais.length ? Math.min(...totais) : 0

  const idades = terminais
    .map((t) => t.maisAntigoPendenteMs)
    .filter((v): v is number => v !== null)

  const heartbeats = terminais
    .map((t) => t.heartbeat.idadeMs)
    .filter((v): v is number => v !== null)

  // Silêncio não pode parecer normalidade: se NENHUM terminal deu sinal dentro
  // da janela, é alerta — inclusive quando nenhum jamais deu sinal.
  const algumHeartbeatRecente = heartbeats.some((ms) => ms <= HEARTBEAT_STALE_MS)

  return res.status(200).json({
    evento: { id: event.id, nome: event.name, slug: event.slug },
    geradoEm: agora.toISOString(),
    limiteHeartbeatMs: HEARTBEAT_STALE_MS,
    maxTentativas: MAX_ATTEMPTS,
    terminais,
    resumo: {
      totalTerminais: terminais.length,
      terminaisAtrasados: terminais.filter((t) => t.heartbeat.atrasado).length,
      // Diferença entre o terminal mais adiantado e o mais atrasado. > 0 = alguém ficou para trás.
      divergenciaSincronizados: maiorTotal - menorTotal,
      totalPendentes: terminais.reduce((s, t) => s + t.pendentes, 0),
      totalFalhas: terminais.reduce((s, t) => s + t.falhas, 0),
      // O indicador que mais denuncia problema: um item esperando há 2 dias não
      // é fila cheia, é coisa quebrada.
      maisAntigoPendenteMs: idades.length ? Math.max(...idades) : null,
      semNenhumHeartbeat: terminais.length > 0 && !algumHeartbeatRecente
    }
  })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
