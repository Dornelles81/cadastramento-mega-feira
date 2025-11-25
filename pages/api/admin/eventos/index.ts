import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireAuth, isSuperAdmin } from '../../../../lib/auth'

const prisma = new PrismaClient()

/**
 * API: Listar todos os eventos (SUPER ADMIN apenas)
 *
 * Segurança:
 * - Requer autenticação
 * - Requer role SUPER_ADMIN
 * - Retorna eventos com contagem de participantes
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    // Require authentication
    const session = await requireAuth(req, res)

    // Check if super admin
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

    // Fetch all events with participant count
    const events = await prisma.event.findMany({
      where: {
        isActive: true
      },
      include: {
        _count: {
          select: {
            participants: true,
            stands: true,
            admins: true
          }
        },
        eventConfigs: {
          select: {
            logoUrl: true,
            primaryColor: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Map events to include permissions for super admin
    const eventsWithPermissions = events.map(event => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
      code: event.code,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      isActive: event.isActive,
      maxCapacity: event.maxCapacity,
      currentCount: event.currentCount,
      logoUrl: event.eventConfigs?.logoUrl,
      primaryColor: event.eventConfigs?.primaryColor,
      _count: event._count,
      permissions: {
        canView: true,
        canEdit: true,
        canApprove: true,
        canDelete: true,
        canExport: true,
        canManageStands: true,
        canManageAdmins: true
      }
    }))

    return res.status(200).json({
      success: true,
      events: eventsWithPermissions,
      total: events.length
    })
  } catch (error: any) {
    console.error('Error in /api/admin/eventos:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({ error: 'Erro ao buscar eventos' })
  }
}
