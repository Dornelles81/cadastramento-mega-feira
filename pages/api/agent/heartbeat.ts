/**
 * POST /api/agent/heartbeat
 *
 * O agente reporta a saúde dos terminais que ele alcança na LAN; a nuvem grava
 * lastSeenAt/lastError por terminal para a tela de saúde do admin. Escopado ao
 * evento do token pela ALOCAÇÃO VIGENTE (TerminalEvent): terminais de outro
 * evento, ou fora do período de alocação, são ignorados em silêncio — o contador
 * `updated` da resposta revela quantos de fato entraram.
 *
 * Body: { terminals: [ { terminalId, online: boolean, error?: string } ] }
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { listAllocatedTerminalIds } from '../../../lib/terminals/allocation'

async function handler(req: NextApiRequest, res: NextApiResponse, agent: AgentContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!agent.eventId) {
    return res.status(403).json({ error: 'Token sem escopo de evento' })
  }

  const items = Array.isArray(req.body?.terminals) ? req.body.terminals : null
  if (!items) {
    return res.status(400).json({ error: 'Body inválido: esperado { terminals: [...] }' })
  }

  const now = new Date()
  let updated = 0

  // ESCOPO por ALOCAÇÃO VIGENTE, resolvido UMA vez fora do laço.
  const allocated = new Set(await listAllocatedTerminalIds(agent.eventId))

  for (const item of items) {
    const { terminalId, online, error, userCount } = item || {}
    if (typeof terminalId !== 'string') continue
    if (!allocated.has(terminalId)) continue

    // A contagem só é gravada quando VEM número. Device offline não tem
    // contagem, e firmware cuja resposta o agente não reconheceu manda
    // `undefined` — nos dois casos a coluna mantém a última medição boa, com
    // `deviceUserCountAt` dizendo de quando ela é. Zerar aqui seria pior que
    // não saber: "0 usuários no terminal" é uma afirmação forte e errada.
    const contagemValida =
      typeof userCount === 'number' && Number.isFinite(userCount) && userCount >= 0

    const result = await prisma.terminal.updateMany({
      where: { id: terminalId },
      data: {
        lastSeenAt: now,
        lastError: online ? null : (typeof error === 'string' ? error.slice(0, 1000) : 'offline'),
        ...(contagemValida ? { deviceUserCount: userCount, deviceUserCountAt: now } : {})
      }
    })
    updated += result.count
  }

  return res.status(200).json({ updated, total: items.length })
}

export default withAgentAuth(handler)
