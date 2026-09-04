import { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'
import { prisma } from '../../../lib/prisma'

/**
 * Marca credencial como impressa. Consumidor unico:
 * app/admin/eventos/[slug] — area de admin, onde o OPERATOR nao entra (o
 * middleware o desvia), entao a regua apertada aqui e ADMIN_ROLES.
 *
 * ── AUTORIZAÇÃO ────────────────────────────────────────────────────────────
 * Exigia apenas `getServerSession` sem checagem de role: qualquer sessão
 * autenticada, de qualquer role, chamava.
 *
 * ⚠️ ESCOPO POR EVENTO: PENDENTE — é role, não vínculo. Ver a nota em
 * ./vehicle-credentials/index.ts: nenhuma conta OPERATOR tem vínculo em
 * `EventAdminAccess` hoje, então exigir `hasEventPermission` recusaria a
 * portaria inteira. Registrado na dívida do levantamento.
 */
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }


  const { participantIds } = req.body as { participantIds: string[] }

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'participantIds required' })
  }

  try {
    const now = new Date()
    const adminId = session.user.id

    // Use raw SQL since Prisma client may not have the new fields cached yet
    await prisma.$executeRawUnsafe(
      `UPDATE participants
       SET credential_printed = true,
           credential_printed_at = $1,
           credential_printed_by = $2
       WHERE id = ANY($3::uuid[])`,
      now,
      adminId,
      participantIds
    )

    return res.status(200).json({ updated: participantIds.length })
  } catch (error: any) {
    console.error('Error marking credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}

// 401 sem sessão, 403 fora de ADMIN_ROLES. BALCAO não entra.
export default withApiAuth(handler, { roles: ADMIN_ROLES })
