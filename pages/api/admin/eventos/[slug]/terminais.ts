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
import { MAX_ATTEMPTS, sqlEsgotada } from '../../../../../lib/agent/retry-policy'

/** Heartbeat mais velho que isto acende alerta no terminal. */
export const HEARTBEAT_STALE_MS = 60 * 60 * 1000 // 1 hora

/**
 * Antecedência do aviso de limpeza: a alocação vence dentro deste prazo e o
 * terminal ainda tem gente sincronizada.
 *
 * O aviso é PRÉVIO de propósito. Marcar depois do vencimento — que é o que
 * `markExpiredAllocations` faz — avisaria sobre uma situação que já não dá para
 * consertar pelo sistema: sem alocação vigente, `/api/agent/work` devolve lista
 * vazia e `reconcileTerminal` vira no-op, então a biometria fica no aparelho e
 * só sai pelo painel dele. O alerta tem de chegar enquanto o agente ainda
 * alcança o terminal.
 *
 * Calculado na leitura, sem cron e sem campo novo: o aviso serve durante a
 * feira, quando esta tela está aberta. (O registro histórico do que venceu é a
 * peça separada, com `expiredAt`/`pendingCleanup`.)
 */
export const AVISO_LIMPEZA_DIAS = 7
const AVISO_LIMPEZA_MS = AVISO_LIMPEZA_DIAS * 24 * 60 * 60 * 1000

/**
 * Ocupação do device a partir da qual a tela avisa.
 *
 * O terminal tem limite físico de faces (`capacityLimit`, default 5000). Cheio,
 * ele passa a RECUSAR novos usuários — e sem este aviso a primeira notícia seria
 * um push falhando durante a feira, que é quando não há o que fazer.
 *
 * 80% é onde ainda dá para agir (redistribuir stands entre terminais, subir o
 * limite se o modelo permitir, acrescentar equipamento). 95% é onde a margem
 * acabou. Os dois patamares são exportados para a tela e a faixa-resumo usarem
 * o MESMO critério — dois números diferentes para a mesma pergunta seria pior
 * que não avisar.
 */
export const OCUPACAO_ATENCAO = 0.8
export const OCUPACAO_CRITICA = 0.95

export type NivelOcupacao = 'desconhecido' | 'ok' | 'atencao' | 'critico'

/** Nível de ocupação do device. Sem medição não há palpite: 'desconhecido'. */
function nivelOcupacao(usuarios: number | null, capacidade: number): NivelOcupacao {
  if (usuarios === null || capacidade <= 0) return 'desconhecido'
  const p = usuarios / capacidade
  if (p >= OCUPACAO_CRITICA) return 'critico'
  if (p >= OCUPACAO_ATENCAO) return 'atencao'
  return 'ok'
}

interface LinhaAgregada {
  terminalId: string
  sincronizados: bigint
  pendentes: bigint
  falhas: bigint
  drenaveis: bigint
  sem_biometria: bigint
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
          deviceModel: true,
          capacityLimit: true, deviceUserCount: true, deviceUserCountAt: true
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
        -- "drenaveis" = o que o ESVAZIAR marcaria, com EXATAMENTE o critério de
        -- drainTerminal (removalState <> 'removed'). Existe para que o número
        -- anunciado na confirmação seja o número executado: numa ação
        -- irreversível, anunciar "3 pessoas" e marcar 5 corrói a confiança no
        -- botão. Não dá para derivar das outras colunas: uma linha em 'failed'
        -- abaixo do teto não entra em nenhuma delas, e uma 'synced' já marcada
        -- para remoção entra em "pendentes" e não em "sincronizados".
        -- (Sem crase neste comentário: ele vive dentro de um template literal.)
        count(*) FILTER (WHERE "removalState" <> 'removed')        AS drenaveis,
        count(*) FILTER (WHERE "faceState"    = 'pending'
                            OR "cardState"    = 'pending'
                            OR "removalState" = 'pending')        AS pendentes,
        -- "falhas" = o que o /work NAO serve mais. A condicao de esgotamento vem
        -- de lib/agent/retry-policy (sqlEsgotada), e nao de um numero escrito
        -- aqui: o teto passou a depender da CLASSE do erro, e uma linha
        -- permanente esgota com UMA tentativa. Repetir a regra aqui faria a tela
        -- exigir 12 de todo mundo e esconder do operador justamente as linhas
        -- que morreram na primeira.
        count(*) FILTER (WHERE ${Prisma.raw(sqlEsgotada())}
                          AND ("faceState"    = 'failed'
                            OR "cardState"    = 'failed'
                            OR "removalState" = 'failed'))        AS falhas,
        -- "sem_biometria" = ESTA NO TERMINAL, COM CARTAO, SEM ROSTO.
        --
        -- E a situacao que produz gente parada na catraca: o addUser e o
        -- registerCard funcionaram, o uploadFace nao. A pessoa existe no
        -- equipamento, passa o cartao e NAO e reconhecida pelo rosto.
        --
        -- cardState = 'synced' e a prova de que o usuario foi criado no device:
        -- o registerCard so acontece depois do addUser. Sem esse recorte, a
        -- conta incluiria quem ainda nem chegou ao terminal.
        -- (Sem crase neste comentario: ele vive dentro de um template literal.)
        --
        -- Ate 2026-09-02 isso so aparecia como uma DIFERENCA entre "No device"
        -- e "Sincronizados" (319 contra 316), que exige o operador interpretar
        -- uma subtracao. Tres pessoas reais do Expofest estavam assim, e a
        -- primeira noticia seria a catraca fechada no dia.
        count(*) FILTER (WHERE "cardState"    = 'synced'
                          AND "faceState"    <> 'synced'
                          AND "removalState"  = 'none')            AS sem_biometria,
        min("createdAt") FILTER (WHERE "faceState"    = 'pending'
                                    OR "cardState"    = 'pending'
                                    OR "removalState" = 'pending') AS mais_antigo_pendente
      FROM participant_terminal_sync
      WHERE "terminalId" IN (${Prisma.join(terminalIds)})
      GROUP BY "terminalId"
    `
  }
  const porTerminal = new Map(agregado.map((r) => [r.terminalId, r]))

  // ---------------------------------------------------------------- consulta 3
  // QUEM está no terminal sem rosto — por PESSOA, não por linha.
  //
  // O agregado acima conta linhas: 3 pessoas em 4 terminais dão 12. O operador
  // precisa do número de PESSOAS e, principalmente, dos NOMES — sem eles o
  // alerta diz "há um problema" e não diz com quem, que é justamente o que
  // permite agir (pedir foto nova àquelas pessoas).
  //
  // `distinct` no participantId: uma linha por pessoa, a de qualquer terminal.
  const pessoasSemBiometria =
    terminalIds.length > 0
      ? await prisma.participantTerminalSync.findMany({
          where: {
            terminalId: { in: terminalIds },
            cardState: 'synced',
            faceState: { not: 'synced' },
            removalState: 'none'
          },
          distinct: ['participantId'],
          select: {
            participantId: true,
            participant: {
              select: { name: true, employeeNo: true, stand: { select: { code: true } } }
            }
          },
          take: 50 // teto de segurança: o alerta é para agir, não para paginar
        })
      : []

  // ------------------------------------------------------------------ montagem
  const terminais = alocacoes.map((a) => {
    const t = a.terminal
    const ag = porTerminal.get(t.id)
    const vigente = a.startDate <= agora && a.endDate >= agora
    const restanteMs = a.endDate.getTime() - agora.getTime()
    const sincronizadosAqui = Number(ag?.sincronizados ?? 0)
    // Ainda dá para limpar pelo sistema (alocação de pé) e há o que limpar.
    const limpezaAVencer = vigente && restanteMs <= AVISO_LIMPEZA_MS && sincronizadosAqui > 0
    // Já venceu com gente dentro: o agente não alcança mais — só o painel do
    // aparelho resolve. É o estado que o aviso prévio existe para evitar.
    const limpezaPerdida = !vigente && a.endDate < agora && sincronizadosAqui > 0
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
        vigente,
        // Dias inteiros que faltam (0 = vence ainda hoje); negativo = já venceu.
        diasParaVencer: Math.floor(restanteMs / (24 * 60 * 60 * 1000))
      },
      limpeza: {
        aVencer: limpezaAVencer,
        perdida: limpezaPerdida,
        // Quantas pessoas o sistema acredita que estão NESTE aparelho agora —
        // é o que a limpeza tem de zerar.
        pessoas: sincronizadosAqui,
        // Quantas linhas o "Esvaziar" marcaria AGORA. É este o número que a
        // confirmação mostra: o anunciado tem de ser o executado.
        drenaveis: Number(ag?.drenaveis ?? 0)
      },
      heartbeat: {
        ultimo: ultimoHeartbeat ? ultimoHeartbeat.toISOString() : null,
        idadeMs: heartbeatIdadeMs,
        // null = nunca deu sinal. É o caso mais grave: silêncio absoluto.
        atrasado: heartbeatIdadeMs === null || heartbeatIdadeMs > HEARTBEAT_STALE_MS
      },
      ultimoErro: t.lastError,
      // Ocupação REAL do equipamento, medida pelo agente no heartbeat. É outra
      // coisa que `sincronizados`: aquilo é o que a nuvem MANDOU, isto é o que o
      // device TEM — inclusive cadastros feitos à mão no painel do terminal, que
      // ocupam vaga e não aparecem em lugar nenhum do nosso lado.
      // `usuarios: null` = ainda não medido (agente antigo, sem o campo no
      // payload) ou firmware cuja resposta não foi reconhecida. Nesse caso NÃO
      // há percentual nem nível: inventar 0% seria afirmar "vazio".
      ocupacao: {
        usuarios: t.deviceUserCount,
        capacidade: t.capacityLimit,
        medidoEm: t.deviceUserCountAt ? t.deviceUserCountAt.toISOString() : null,
        percentual:
          t.deviceUserCount !== null && t.capacityLimit > 0
            ? t.deviceUserCount / t.capacityLimit
            : null,
        nivel: nivelOcupacao(t.deviceUserCount, t.capacityLimit)
      },
      sincronizados: Number(ag?.sincronizados ?? 0),
      pendentes: Number(ag?.pendentes ?? 0),
      falhas: Number(ag?.falhas ?? 0),
      // Está no terminal, com cartão, sem rosto — ver o comentário do agregado.
      semBiometria: Number(ag?.sem_biometria ?? 0),
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
    ocupacaoAtencao: OCUPACAO_ATENCAO,
    ocupacaoCritica: OCUPACAO_CRITICA,
    avisoLimpezaDias: AVISO_LIMPEZA_DIAS,
    terminais,
    resumo: {
      totalTerminais: terminais.length,
      terminaisAtrasados: terminais.filter((t) => t.heartbeat.atrasado).length,
      // Sobe para a faixa-resumo: encher terminal é problema que só tem solução
      // ANTES de acontecer, então precisa aparecer sem exigir navegação.
      terminaisQuaseCheios: terminais.filter((t) => t.ocupacao.nivel === 'atencao').length,
      terminaisCriticos: terminais.filter((t) => t.ocupacao.nivel === 'critico').length,
      terminaisSemMedicao: terminais.filter((t) => t.ocupacao.nivel === 'desconhecido').length,
      // Diferença entre o terminal mais adiantado e o mais atrasado. > 0 = alguém ficou para trás.
      divergenciaSincronizados: maiorTotal - menorTotal,
      totalPendentes: terminais.reduce((s, t) => s + t.pendentes, 0),
      totalFalhas: terminais.reduce((s, t) => s + t.falhas, 0),
      // O indicador que mais denuncia problema: um item esperando há 2 dias não
      // é fila cheia, é coisa quebrada.
      maisAntigoPendenteMs: idades.length ? Math.max(...idades) : null,
      semNenhumHeartbeat: terminais.length > 0 && !algumHeartbeatRecente,
      // Limpeza pós-feira (LGPD): a alocação está para vencer e ainda há gente
      // no aparelho. Enquanto este número for > 0 e a alocação estiver de pé, a
      // limpeza ainda pode ser feita pelo sistema.
      // Pessoas que estão nos terminais COM cartão e SEM rosto: vão passar o
      // crachá e não ser reconhecidas. É o alerta que evita alguém descobrir
      // isso na fila, no dia.
      pessoasSemBiometria: pessoasSemBiometria.map((l) => ({
        id: l.participantId,
        nome: l.participant?.name ?? '(sem nome)',
        employeeNo: l.participant?.employeeNo ?? null,
        stand: l.participant?.stand?.code ?? null
      })),
      terminaisAguardandoLimpeza: terminais.filter((t) => t.limpeza.aVencer).length,
      // Já venceu com gente dentro: o agente não alcança mais.
      terminaisLimpezaPerdida: terminais.filter((t) => t.limpeza.perdida).length,
      pessoasAguardandoLimpeza: terminais
        .filter((t) => t.limpeza.aVencer || t.limpeza.perdida)
        .reduce((s, t) => s + t.limpeza.pessoas, 0)
    }
  })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
