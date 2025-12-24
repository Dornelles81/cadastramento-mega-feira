import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

/**
 * API: Get event access statistics
 *
 * GET /api/access/stats/[eventId]
 * Returns real-time stats: current inside, total entries/exits, peak, etc.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { eventId } = req.query

    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'Event ID is required' })
    }

    // Get event
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { id: eventId },
          { slug: eventId },
          { code: eventId }
        ]
      },
      select: {
        id: true,
        name: true,
        code: true,
        slug: true,
        status: true,
        maxCapacity: true,
        currentCount: true
      }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // Get or calculate stats
    let stats = await prisma.accessStats.findUnique({
      where: { eventId: event.id }
    })

    // If no stats exist, calculate from logs
    if (!stats) {
      const totalEntries = await prisma.accessLog.count({
        where: { eventId: event.id, type: 'ENTRY' }
      })

      const totalExits = await prisma.accessLog.count({
        where: { eventId: event.id, type: 'EXIT' }
      })

      const uniqueVisitors = await prisma.accessLog.groupBy({
        by: ['participantId'],
        where: { eventId: event.id, type: 'ENTRY' }
      })

      // Calculate current inside by counting entries - exits per participant
      const participantsInside = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT p."participantId") as count
        FROM (
          SELECT "participantId",
                 (SELECT type FROM "access_logs" al2
                  WHERE al2."participantId" = al."participantId"
                  ORDER BY "createdAt" DESC LIMIT 1) as last_type
          FROM "access_logs" al
          WHERE al."eventId" = ${event.id}
          GROUP BY "participantId"
        ) p
        WHERE p.last_type = 'ENTRY'
      `.catch(() => [{ count: 0 }])

      const currentInside = Number(participantsInside[0]?.count || 0)

      stats = {
        id: 'calculated',
        eventId: event.id,
        currentInsideCount: currentInside,
        totalEntries,
        totalExits,
        uniqueVisitors: uniqueVisitors.length,
        peakCount: currentInside,
        peakTime: null,
        lastEntryAt: null,
        lastExitAt: null,
        updatedAt: new Date()
      }
    }

    // Get recent activity (last 20 entries/exits)
    const recentActivity = await prisma.accessLog.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        participant: {
          select: {
            id: true,
            name: true,
            cpf: true,
            faceImageUrl: true
          }
        }
      }
    })

    // Get hourly distribution for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const hourlyStats = await prisma.accessLog.groupBy({
      by: ['type'],
      where: {
        eventId: event.id,
        createdAt: { gte: today }
      },
      _count: true
    })

    // Get participants currently inside
    const participantsInsideList = await prisma.$queryRaw<{ participantId: string }[]>`
      SELECT DISTINCT al."participantId"
      FROM "access_logs" al
      WHERE al."eventId" = ${event.id}
        AND al.type = 'ENTRY'
        AND NOT EXISTS (
          SELECT 1 FROM "access_logs" al2
          WHERE al2."participantId" = al."participantId"
            AND al2.type = 'EXIT'
            AND al2."createdAt" > al."createdAt"
        )
    `.catch(() => [])

    const insideParticipants = await prisma.participant.findMany({
      where: {
        id: { in: participantsInsideList.map(p => p.participantId) }
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        faceImageUrl: true,
        stand: {
          select: { name: true, code: true }
        }
      }
    })

    return res.status(200).json({
      success: true,
      event: {
        id: event.id,
        name: event.name,
        code: event.code,
        slug: event.slug,
        status: event.status,
        maxCapacity: event.maxCapacity,
        registeredCount: event.currentCount
      },
      stats: {
        currentInsideCount: stats.currentInsideCount,
        totalEntries: stats.totalEntries,
        totalExits: stats.totalExits,
        uniqueVisitors: stats.uniqueVisitors,
        peakCount: stats.peakCount,
        peakTime: stats.peakTime,
        lastEntryAt: stats.lastEntryAt,
        lastExitAt: stats.lastExitAt,
        occupancyPercentage: event.maxCapacity > 0
          ? Math.round((stats.currentInsideCount / event.maxCapacity) * 100)
          : 0
      },
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        type: a.type,
        time: a.createdAt,
        gate: a.gate,
        participant: {
          id: a.participant.id,
          name: a.participant.name,
          cpf: a.participant.cpf,
          faceImageUrl: a.participant.faceImageUrl
        }
      })),
      participantsInside: insideParticipants.map(p => ({
        id: p.id,
        name: p.name,
        cpf: p.cpf,
        faceImageUrl: p.faceImageUrl,
        stand: p.stand?.name || p.stand?.code
      })),
      hourlyToday: {
        entries: hourlyStats.find(h => h.type === 'ENTRY')?._count || 0,
        exits: hourlyStats.find(h => h.type === 'EXIT')?._count || 0
      },
      generatedAt: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Access stats error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
