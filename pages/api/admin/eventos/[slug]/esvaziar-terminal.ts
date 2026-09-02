/**
 * POST /api/admin/eventos/[slug]/esvaziar-terminal
 *   body: { terminalId, confirmacaoNome }
 *
 * Marca remoção pendente em todas as linhas de sync do terminal — o agente
 * executa os `deleteUser` pelo caminho normal. É a ação de limpeza pós-feira.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * A limpeza dos terminais no fim do evento é obrigação de LGPD, e até aqui não
 * havia como fazê-la pelo sistema: `enqueueRemoval` é por participante,
 * `reconcileTerminal` recusa esvaziar sem alocação vigente (de propósito), e
 * encerrar a alocação apenas cala o agente. Sobrava apagar no painel de cada
 * aparelho — o que funciona e não deixa rastro nenhum. "Alguém apagou em cada
 * terminal" não é prova de conformidade; uma linha de auditoria com a contagem é.
 *
 * ── Duas travas, e por que cada uma ────────────────────────────────────────
 * 1. CONFIRMAÇÃO POR NOME: o corpo precisa trazer o nome do terminal digitado.
 *    Um clique com confirm() é fácil demais para a ação mais destrutiva do
 *    sistema, e a tela lista vários terminais parecidos — digitar o nome é o
 *    que garante que a pessoa esvaziou o que pretendia. A comparação é
 *    normalizada (caixa, espaços e variantes de traço) porque os nomes reais
 *    contêm travessão "—", que ninguém digita: exigir o caractere exato
 *    transformaria a trava em obstáculo burro, e obstáculo burro é contornado
 *    colando o nome sem ler.
 * 2. ESCOPO POR ALOCAÇÃO: o terminal precisa estar alocado a ESTE evento. Sem
 *    isso, o slug seria decorativo e um admin com permissão em um evento
 *    esvaziaria o terminal de outro.
 *
 * NÃO exige alocação VIGENTE: esvaziar depois do vencimento é justamente o caso
 * de uso. Mas o agente só executa dentro da vigência (`/work` filtra por
 * alocação vigente), então fora dela as linhas ficam `pending` esperando —
 * a resposta avisa.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { drainTerminal } from '../../../../../lib/agent/sync-enqueue'
import { listAllocatedTerminalIds } from '../../../../../lib/terminals/allocation'

/**
 * Normaliza para comparar nome digitado × nome cadastrado: sem acento de caixa,
 * espaços colapsados, e todo traço (— – −) virando "-". Mantém a exigência de
 * saber o nome; perdoa o que o teclado não produz.
 */
function normalizarNome(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug ausente' })

  const event = await prisma.event.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, slug: true, name: true }
  })
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' })

  // Esvaziar MEXE no device: exige permissão de edição, não só de ver.
  if (!hasEventPermission(session, event.slug, 'canEdit')) {
    return res.status(403).json({ error: 'Sem permissão para esvaziar terminais neste evento' })
  }

  const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId : ''
  const confirmacaoNome = typeof req.body?.confirmacaoNome === 'string' ? req.body.confirmacaoNome : ''
  if (!terminalId) return res.status(400).json({ error: 'terminalId ausente' })
  if (!confirmacaoNome) {
    return res.status(400).json({ error: 'Digite o nome do terminal para confirmar.' })
  }

  // ESCOPO: o terminal tem de estar alocado a este evento (vigente ou não).
  const alocado = await prisma.terminalEvent.findFirst({
    where: { terminalId, eventId: event.id, isActive: true },
    select: { id: true, endDate: true }
  })
  if (!alocado) {
    return res.status(404).json({ error: 'Terminal não está alocado a este evento' })
  }

  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { id: true, name: true, ipAddress: true }
  })
  if (!terminal) return res.status(404).json({ error: 'Terminal não encontrado' })

  if (normalizarNome(confirmacaoNome) !== normalizarNome(terminal.name)) {
    return res.status(400).json({
      error: `O nome digitado não confere com "${terminal.name}". Nada foi alterado.`
    })
  }

  const linhasMarcadas = await drainTerminal(terminalId)

  // O agente só trabalha dentro da alocação vigente: fora dela as linhas ficam
  // pendentes esperando. Dizer isso na resposta evita a leitura errada de que a
  // biometria já saiu do aparelho.
  const vigentes = await listAllocatedTerminalIds(event.id)
  const agenteAlcanca = vigentes.includes(terminalId)

  // adminId é FK para EventAdmin: um id que não exista lá derruba a gravação do
  // log — e perder o registro é perder a prova que esta ação existe para deixar.
  const user = session.user as any
  let adminId: string | null = null
  if (user?.id) {
    const existe = await prisma.eventAdmin
      .findUnique({ where: { id: user.id }, select: { id: true } })
      .catch(() => null)
    adminId = existe?.id ?? null
  }
  const ip =
    ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    null

  // A CONTAGEM é o ponto do log: é ela que permite conferir depois que o
  // número bateu — quantas linhas foram marcadas aqui × quantas viraram
  // `removed` no fim. Sem isso a auditoria diria "alguém mandou esvaziar" e
  // não permitiria verificar nada.
  try {
    await prisma.auditLog.create({
      data: {
        eventId: event.id,
        action: 'TERMINAL_ESVAZIADO',
        entityType: 'terminal',
        entityId: terminalId,
        actorType: 'admin',
        actorIdentifier: user?.email ?? null,
        adminId,
        adminEmail: user?.email ?? null,
        adminIp: ip,
        userAgent: (req.headers['user-agent'] as string) ?? null,
        description:
          `Terminal "${terminal.name}" (${terminal.ipAddress}) esvaziado: ` +
          `${linhasMarcadas} ${linhasMarcadas === 1 ? 'linha marcada' : 'linhas marcadas'} para remoção`,
        metadata: {
          linhasMarcadas,
          terminalNome: terminal.name,
          terminalIp: terminal.ipAddress,
          agenteAlcanca,
          alocacaoFim: alocado.endDate.toISOString()
        },
        severity: 'WARNING'
      }
    })
  } catch (e: any) {
    console.error('[esvaziar-terminal] auditLog falhou:', e?.message)
  }

  return res.status(200).json({
    success: true,
    terminal: terminal.name,
    linhasMarcadas,
    agenteAlcanca,
    mensagem: agenteAlcanca
      ? `${linhasMarcadas} ${linhasMarcadas === 1 ? 'pessoa marcada' : 'pessoas marcadas'} para remoção. O agente executa nos próximos ciclos.`
      : `${linhasMarcadas} ${linhasMarcadas === 1 ? 'pessoa marcada' : 'pessoas marcadas'}, mas a alocação deste terminal não está vigente: ` +
        `o agente não vai executar até que ela volte a valer. A biometria continua no aparelho.`
  })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
