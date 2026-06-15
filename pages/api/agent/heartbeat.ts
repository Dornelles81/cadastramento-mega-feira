/**
 * POST /api/agent/heartbeat
 *
 * O agente reporta a saúde dos terminais que ele alcança na LAN; a nuvem grava
 * lastSeenAt/lastError por terminal para a tela de saúde do admin. Escopado ao
 * evento do token (terminais de outro evento são ignorados).
 *
 * Body: { terminals: [ { terminalId, online: boolean, error?: string } ] }
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'

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

  for (const item of items) {
    const { terminalId, online, error } = item || {}
    if (typeof terminalId !== 'string') continue

    // updateMany com filtro de escopo: só toca terminais do evento do token.
    const result = await prisma.terminal.updateMany({
      where: { id: terminalId, eventId: agent.eventId },
      data: {
        lastSeenAt: now,
        lastError: online ? null : (typeof error === 'string' ? error.slice(0, 1000) : 'offline')
      }
    })
    updated += result.count
  }

  return res.status(200).json({ updated, total: items.length })
}

export default withAgentAuth(handler)
