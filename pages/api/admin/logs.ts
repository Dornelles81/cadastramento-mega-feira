import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireAuth, isSuperAdmin } from '../../../lib/auth'

const prisma = new PrismaClient()

/**
 * API: Buscar logs de auditoria (SUPER ADMIN apenas)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    // Require super admin
    const session = await requireAuth(req, res)
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

    // Get query params
    const { limit = '100', severity, action, eventId } = req.query

    // Build where clause
    const where: any = {}
    if (severity) where.severity = severity
    if (action) where.action = action
    if (eventId) where.eventId = eventId

    // Fetch logs
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        event: {
          select: {
            name: true,
            code: true
          }
        },
        admin: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit as string)
    })

    return res.status(200).json({
      success: true,
      logs: logs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        adminEmail: log.admin?.email || log.adminEmail,
        adminName: log.admin?.name,
        description: log.description,
        severity: log.severity,
        createdAt: log.createdAt,
        event: log.event,
        metadata: log.metadata
      })),
      total: logs.length
    })
  } catch (error: any) {
    console.error('Error fetching logs:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({ error: 'Erro ao buscar logs' })
  }
}
