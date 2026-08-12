/**
 * GET /api/agent/terminals
 *
 * Único ponto onde a senha do device sai da nuvem DECRIPTADA, sobre HTTPS, para
 * o agente que precisa dela no digest-auth da LAN. Só responde para token de
 * agente válido e só os terminais do escopo (evento) do token.
 *
 * A MASTER_KEY é tocada apenas aqui (server-side) para decriptar
 * Terminal.passwordEncrypted; o PC do evento nunca a tem.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { decryptToString, isEncryptedPayload } from '../../../lib/crypto'
import { listAllocatedTerminalIds } from '../../../lib/terminals/allocation'

async function handler(req: NextApiRequest, res: NextApiResponse, agent: AgentContext) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!agent.eventId) {
    return res.status(200).json({ terminals: [] })
  }

  // ESCOPO por ALOCAÇÃO VIGENTE (não mais `Terminal.eventId`). Aqui isso é
  // especialmente relevante: este endpoint entrega a SENHA DO DEVICE em claro.
  // Com o período respeitado, um agente cujo evento terminou deixa de receber
  // credencial de terminal.
  const allocatedIds = await listAllocatedTerminalIds(agent.eventId)
  if (allocatedIds.length === 0) {
    return res.status(200).json({ terminals: [] })
  }

  const rows = await prisma.terminal.findMany({
    where: { id: { in: allocatedIds } },
    orderBy: { createdAt: 'asc' }
  })

  const terminals = rows.map((t) => {
    let password: string | null = null
    if (t.passwordEncrypted) {
      const buf = Buffer.isBuffer(t.passwordEncrypted)
        ? t.passwordEncrypted
        : Buffer.from(t.passwordEncrypted)
      if (isEncryptedPayload(buf)) {
        try {
          password = decryptToString(buf)
        } catch (error) {
          console.error(`Falha ao decriptar senha do terminal ${t.id}:`, error)
        }
      }
    }
    return {
      id: t.id,
      name: t.name,
      ipAddress: t.ipAddress,
      port: t.port,
      useHttps: t.useHttps,
      username: t.username,
      password, // em claro, só sob token válido e HTTPS
      gate: t.gate,
      capacityLimit: t.capacityLimit,
      isActive: t.isActive
    }
  })

  return res.status(200).json({ terminals })
}

export default withAgentAuth(handler)
