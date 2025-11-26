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

  if (req.method === 'POST') {
    // Assign event to admin
    try {
      const {
        adminId,
        eventId,
        canView = true,
        canEdit = true,
        canApprove = true,
        canDelete = false,
        canExport = true,
        canManageStands = true,
        canManageAdmins = false
      } = req.body

      // Validate required fields
      if (!adminId || !eventId) {
        return res.status(400).json({ error: 'Bad request', message: 'adminId and eventId are required' })
      }

      // Check if access already exists
      const existingAccess = await prisma.eventAdminAccess.findFirst({
        where: {
          adminId,
          eventId
        }
      })

      if (existingAccess) {
        return res.status(400).json({ error: 'Bad request', message: 'Admin already has access to this event' })
      }

      // Create event access
      const access = await prisma.eventAdminAccess.create({
        data: {
          adminId,
          eventId,
          canView,
          canEdit,
          canApprove,
          canDelete,
          canExport,
          canManageStands,
          canManageAdmins,
          isActive: true
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

      return res.status(201).json({ access })
    } catch (error: any) {
      console.error('Error assigning event:', error)
      return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
