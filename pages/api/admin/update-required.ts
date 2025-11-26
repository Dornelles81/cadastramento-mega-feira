import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { requireAuth, isSuperAdmin } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check authentication using NextAuth
    const session = await requireAuth(req, res)

    // Only Super Admins can update field requirements
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }
    // Update all existing custom fields to be required
    const result = await prisma.customField.updateMany({
      where: {
        required: false
      },
      data: {
        required: true
      }
    })

    return res.status(200).json({
      message: 'Fields updated successfully',
      count: result.count
    })
  } catch (error: any) {
    console.error('Error in /api/admin/update-required:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}