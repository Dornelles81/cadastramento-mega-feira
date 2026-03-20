import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { getSession } from '../../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res)
  if (!session?.user) return res.status(401).json({ error: 'Não autenticado' })

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
