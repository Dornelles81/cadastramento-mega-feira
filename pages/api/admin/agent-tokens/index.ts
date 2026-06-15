/**
 * Admin — tokens do agente local.
 *   GET  /api/admin/agent-tokens[?eventId=]   lista (NUNCA devolve o hash/token)
 *   POST /api/admin/agent-tokens               gera (retorna o token em claro UMA vez)
 *
 * O token em claro só existe na resposta do POST — copie e configure no PC do
 * evento; não há como recuperá-lo depois (só o hash fica no banco).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../../lib/api-auth'
import { generateAgentToken } from '../../../../lib/agent/tokens'

function publicToken(t: any) {
  const { tokenHash, ...rest } = t
  return {
    ...rest,
    status: t.revokedAt ? 'revoked' : (t.expiresAt && t.expiresAt < new Date() ? 'expired' : 'active')
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method === 'GET') {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined
    const rows = await prisma.agentToken.findMany({
      where: eventId ? { eventId } : {},
      orderBy: { createdAt: 'desc' }
    })
    return res.status(200).json({ tokens: rows.map(publicToken) })
  }

  if (req.method === 'POST') {
    const { eventId, name, expiresAt } = req.body || {}
    if (!eventId || !name) {
      return res.status(400).json({ error: 'eventId e name são obrigatórios' })
    }
    const user = session.user as any
    const { id, token } = await generateAgentToken(
      { eventId, name, expiresAt: expiresAt ? new Date(expiresAt) : null },
      { adminId: user?.id ?? null, adminEmail: user?.email ?? null }
    )
    // token em claro retornado UMA única vez
    return res.status(201).json({ id, token })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
