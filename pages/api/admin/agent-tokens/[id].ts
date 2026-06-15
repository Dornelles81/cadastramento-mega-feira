/**
 * Admin — revogação de token do agente (kill switch).
 *   DELETE /api/admin/agent-tokens/[id]   revoga (idempotente)
 *
 * Não deletamos a linha: marcamos revokedAt para manter o rastro de auditoria.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { withApiAuth, ADMIN_ROLES } from '../../../../lib/api-auth'
import { revokeAgentToken } from '../../../../lib/agent/tokens'

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: 'id ausente' })

  const user = session.user as any
  await revokeAgentToken(id, { adminId: user?.id ?? null, adminEmail: user?.email ?? null })
  return res.status(200).json({ success: true })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
