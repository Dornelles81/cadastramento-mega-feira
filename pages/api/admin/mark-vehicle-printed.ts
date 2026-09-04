import { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { withApiAuth, OPERATOR_ROLES } from '../../../lib/api-auth'
import { prisma } from '../../../lib/prisma'

/**
 * Marca credencial veicular como impressa. Consumidor unico:
 * app/admin/access-control/credentials — area da portaria.
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


  const { vehicleIds } = req.body as { vehicleIds: string[] }

  if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
    return res.status(400).json({ error: 'vehicleIds required' })
  }

  try {
    const now = new Date()
    const adminId = (session.user as { id?: string }).id ?? 'unknown'

    await prisma.$executeRawUnsafe(
      `UPDATE vehicle_credentials
       SET credential_printed = true,
           credential_printed_at = $1,
           credential_printed_by = $2
       WHERE id = ANY($3::uuid[])`,
      now,
      adminId,
      vehicleIds
    )

    return res.status(200).json({ updated: vehicleIds.length })
  } catch (error: any) {
    console.error('Error marking vehicle credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}

// 401 sem sessão, 403 fora de OPERATOR_ROLES. BALCAO não entra.
export default withApiAuth(handler, { roles: OPERATOR_ROLES })
