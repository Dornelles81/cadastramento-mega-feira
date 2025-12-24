import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API: Fast participant status lookup
 * Optimized for speed - minimal data returned
 * IMPORTANT: Requires eventId - participants are segregated by event
 *
 * GET /api/access/fast-status?q=CPF_OR_ID&eventId=xxx
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { q, eventId } = req.query

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query (q) is required' })
    }

    // eventId is REQUIRED for segregation
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId is required - participants are segregated by event' })
    }

    // Determine search type: CPF (11 digits) or ID
    const cleanQuery = q.replace(/\D/g, '')
    const isCPF = cleanQuery.length === 11

    // Build where clause - ALWAYS filter by event
    let whereClause: any = {
      eventId: eventId // Always required
    }

    if (isCPF) {
      whereClause.cpf = cleanQuery
    } else if (q.length === 8) {
      whereClause.id = { startsWith: q.toLowerCase() }
    } else {
      whereClause.id = q
    }

    // Single optimized query
    const participant = await prisma.participant.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        cpf: true,
        faceImageUrl: true,
        approvalStatus: true,
        eventId: true,
        stand: {
          select: { name: true, code: true }
        }
      }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Not found' })
    }

    // Get last access in single query
    const lastAccess = await prisma.accessLog.findFirst({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'desc' },
      select: { type: true, createdAt: true }
    })

    const isInside = lastAccess?.type === 'ENTRY'
    const isApproved = participant.approvalStatus === 'approved'

    return res.status(200).json({
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf,
      photo: participant.faceImageUrl,
      stand: participant.stand?.name || participant.stand?.code,
      eventId: participant.eventId,
      status: participant.approvalStatus || 'pending',
      isApproved,
      isInside,
      canEnter: isApproved && !isInside,
      canExit: isInside,
      lastType: lastAccess?.type || null,
      lastTime: lastAccess?.createdAt || null
    })

  } catch (error: any) {
    console.error('Fast status error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
