import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'Super Admin access required' })
  }

  const { id } = req.query

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Bad request', message: 'Invalid admin ID' })
  }

  if (req.method === 'PATCH') {
    // Update admin (currently only supports isActive)
    try {
      const { isActive } = req.body

      const admin = await prisma.eventAdmin.update({
        where: { id },
        data: { isActive }
      })

      // Remove password from response
      const { password: _, ...adminWithoutPassword } = admin

      return res.status(200).json({ admin: adminWithoutPassword })
    } catch (error: any) {
      console.error('Error updating admin:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
