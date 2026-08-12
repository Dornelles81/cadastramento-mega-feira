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
 * Escopo: o terminal precisa ter ALOCAÇÃO VIGENTE para o evento do token
 * (TerminalEvent, com período) — não basta o vínculo antigo sem data.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { reconcileTerminal, type DeviceUser } from '../../../lib/agent/reconcile'
import { isTerminalAllocatedToEvent } from '../../../lib/terminals/allocation'

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

  // Escopo por ALOCAÇÃO VIGENTE: o terminal precisa atender o evento do token
  // AGORA. Fora do período, 403 — e a reconciliação nem chega a rodar (ela tem
  // sua própria trava de no-op, mas o escopo é decidido aqui).
  const noEscopo = await isTerminalAllocatedToEvent(terminalId, agent.eventId)
  if (!noEscopo) {
    return res.status(403).json({ error: 'terminal fora do escopo do token (sem alocação vigente para este evento)' })
  }

  // Sanitiza o roster (employeeNo string; contagens numéricas).
  const users: DeviceUser[] = usersRaw
    .filter((u: any) => u && typeof u.employeeNo === 'string')
    .map((u: any) => ({ employeeNo: u.employeeNo, numOfFace: Number(u.numOfFace) || 0, numOfCard: Number(u.numOfCard) || 0 }))

  const result = await reconcileTerminal(terminalId, users)
  return res.status(200).json(result)
}

export default withAgentAuth(handler)
