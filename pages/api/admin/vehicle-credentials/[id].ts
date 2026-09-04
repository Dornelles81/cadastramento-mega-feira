import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { withApiAuth, OPERATOR_ROLES } from '../../../../lib/api-auth'

/**
 * PATCH (placa) e DELETE (desativa) de uma credencial veicular.
 * Mesma régua e a MESMA pendência de escopo por evento do ./index.ts — ver o
 * comentário de autorização de lá antes de mexer aqui.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {

  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID inválido' })

  // ── PATCH: update plate ────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { plate } = req.body as { plate: string | null }

    try {
      const updated = await prisma.vehicleCredential.update({
        where: { id },
        data: { plate: plate?.trim().toUpperCase() || null }
      })
      return res.status(200).json({ credential: updated })
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao atualizar', details: error.message })
    }
  }

  // ── DELETE: soft-delete ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      await prisma.vehicleCredential.update({
        where: { id },
        data: { isActive: false }
      })
      return res.status(200).json({ success: true })
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao excluir', details: error.message })
    }
  }

  return res.status(405).json({ error: 'Método não permitido' })
}

// 401 sem sessão, 403 fora de OPERATOR_ROLES (admins + OPERATOR). BALCAO não entra.
export default withApiAuth(handler, { roles: OPERATOR_ROLES })
