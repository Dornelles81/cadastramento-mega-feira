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

    // Mesmo par de bugs do ./mark-credential-printed.ts, mesma correção — ver a
    // nota longa lá: colunas camelCase entre aspas no banco (o SQL cru mandava
    // snake_case → 42703) e `id` TEXT comparado com uuid[] → 42883. As 2.100
    // credenciais veiculares do Expofest estão todas `false` por causa disso.
    const { count } = await prisma.vehicleCredential.updateMany({
      where: { id: { in: vehicleIds } },
      data: {
        credentialPrinted: true,
        credentialPrintedAt: now,
        credentialPrintedBy: adminId
      }
    })

    return res.status(200).json({ updated: count })
  } catch (error: any) {
    console.error('Error marking vehicle credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}

// 401 sem sessão, 403 fora de OPERATOR_ROLES. BALCAO não entra.
export default withApiAuth(handler, { roles: OPERATOR_ROLES })
