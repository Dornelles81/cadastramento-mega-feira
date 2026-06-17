/**
 * POST /api/agent/reconcile
 *
 * O agente reporta o roster REAL de um terminal (lista paginada de usuários do
 * device); a nuvem compara com o desejado (banco) e enfileira correções em
 * ParticipantTerminalSync. A nuvem NÃO fala com o device — devolve, além das
 * contagens, `removeEmployeeNos`: órfãos SEM linha de sync que o agente deve
 * deletar diretamente (não há linha p/ enfileirar).
 *
 * Body: { terminalId, users: [ { employeeNo, numOfFace, numOfCard } ] }
 * Escopo: o terminal precisa pertencer ao evento do token.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { reconcileTerminal, type DeviceUser } from '../../../lib/agent/reconcile'

async function handler(req: NextApiRequest, res: NextApiResponse, agent: AgentContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!agent.eventId) {
    return res.status(403).json({ error: 'Token sem escopo de evento' })
  }

  const terminalId = typeof req.body?.terminalId === 'string' ? req.body.terminalId : null
  const usersRaw = Array.isArray(req.body?.users) ? req.body.users : null
  if (!terminalId || !usersRaw) {
    return res.status(400).json({ error: 'Body inválido: esperado { terminalId, users: [...] }' })
  }

  // Escopo: só terminal do evento do token.
  const term = await prisma.terminal.findFirst({
    where: { id: terminalId, eventId: agent.eventId },
    select: { id: true }
  })
  if (!term) {
    return res.status(403).json({ error: 'terminal fora do escopo do token' })
  }

  // Sanitiza o roster (employeeNo string; contagens numéricas).
  const users: DeviceUser[] = usersRaw
    .filter((u: any) => u && typeof u.employeeNo === 'string')
    .map((u: any) => ({ employeeNo: u.employeeNo, numOfFace: Number(u.numOfFace) || 0, numOfCard: Number(u.numOfCard) || 0 }))

  const result = await reconcileTerminal(agent.eventId, terminalId, users)
  return res.status(200).json(result)
}

export default withAgentAuth(handler)
