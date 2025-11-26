import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'Super Admin access required' })
  }

  const { id } = req.query

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Bad request', message: 'Invalid access ID' })
  }

  if (req.method === 'PATCH') {
    // Update permissions for event access
    try {
      const {
        canView,
        canEdit,
        canApprove,
        canDelete,
        canExport,
        canManageStands,
        canManageAdmins,
        isActive
      } = req.body

      const access = await prisma.eventAdminAccess.update({
        where: { id },
        data: {
          ...(typeof canView === 'boolean' && { canView }),
          ...(typeof canEdit === 'boolean' && { canEdit }),
          ...(typeof canApprove === 'boolean' && { canApprove }),
          ...(typeof canDelete === 'boolean' && { canDelete }),
          ...(typeof canExport === 'boolean' && { canExport }),
          ...(typeof canManageStands === 'boolean' && { canManageStands }),
          ...(typeof canManageAdmins === 'boolean' && { canManageAdmins }),
          ...(typeof isActive === 'boolean' && { isActive })
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              code: true,
              slug: true
            }
          }
        }
      })

      return res.status(200).json({ access })
    } catch (error: any) {
      console.error('Error updating access:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  if (req.method === 'DELETE') {
    // Remove event access from admin
    try {
      await prisma.eventAdminAccess.delete({
        where: { id }
      })

      return res.status(200).json({ message: 'Access removed successfully' })
    } catch (error: any) {
      console.error('Error deleting access:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
