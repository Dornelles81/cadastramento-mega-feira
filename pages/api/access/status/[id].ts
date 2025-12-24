import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

/**
 * API: Get participant access status
 * IMPORTANT: Requires eventId - participants are segregated by event
 *
 * GET /api/access/status/[id]?eventId=xxx
 * Returns current status (inside/outside), last access, and history
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id, eventId } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Participant ID is required' })
    }

    // eventId is REQUIRED for proper segregation
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId is required - participants are segregated by event' })
    }

    // Support: full ID (uuid), short ID (8 chars), or CPF (11 digits)
    const isCPF = /^\d{11}$/.test(id.replace(/\D/g, ''))
    const cleanCPF = id.replace(/\D/g, '')

    // Always include eventId in the where clause
    let whereClause: any = {
      eventId: eventId
    }

    if (isCPF) {
      // Search by CPF (remove formatting)
      whereClause.cpf = cleanCPF
    } else if (id.length === 8) {
      // Short ID (first 8 chars of uuid)
      whereClause.id = { startsWith: id.toLowerCase() }
    } else {
      // Full ID
      whereClause.id = id
    }

    const participant = await prisma.participant.findFirst({
      where: whereClause,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            status: true
          }
        },
        stand: {
          select: { code: true, name: true }
        }
      }
    })

    if (!participant) {
      return res.status(404).json({
        error: 'Participant not found',
        message: 'Participante nao encontrado'
      })
    }

    // Get last access
    const lastAccess = await prisma.accessLog.findFirst({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'desc' }
    })

    // Get access history (last 10)
    const accessHistory = await prisma.accessLog.findMany({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    // Calculate stats
    const totalEntries = await prisma.accessLog.count({
      where: { participantId: participant.id, type: 'ENTRY' }
    })

    const totalExits = await prisma.accessLog.count({
      where: { participantId: participant.id, type: 'EXIT' }
    })

    const isInside = lastAccess?.type === 'ENTRY'
    const isApproved = participant.approvalStatus === 'approved'
    const canEnter = isApproved && !isInside

    // Calculate total time inside
    let totalTimeInside = 0
    const entries = accessHistory.filter(a => a.type === 'ENTRY')
    const exits = accessHistory.filter(a => a.type === 'EXIT')

    for (let i = 0; i < Math.min(entries.length, exits.length); i++) {
      const entry = entries[i]
      const exit = exits.find(e => e.createdAt > entry.createdAt)
      if (exit) {
        totalTimeInside += exit.createdAt.getTime() - entry.createdAt.getTime()
      }
    }

    // If currently inside, add time since last entry
    if (isInside && lastAccess) {
      totalTimeInside += Date.now() - lastAccess.createdAt.getTime()
    }

    return res.status(200).json({
      success: true,
      participant: {
        id: participant.id,
        shortId: participant.id.substring(0, 8).toUpperCase(),
        name: participant.name,
        cpf: participant.cpf,
        email: participant.email,
        phone: participant.phone,
        faceImageUrl: participant.faceImageUrl,
        approvalStatus: participant.approvalStatus || 'pending',
        isApproved
      },
      event: participant.event ? {
        id: participant.event.id,
        name: participant.event.name,
        code: participant.event.code,
        status: participant.event.status
      } : null,
      stand: participant.stand ? {
        code: participant.stand.code,
        name: participant.stand.name
      } : null,
      accessStatus: {
        isInside,
        canEnter,
        canExit: isInside,
        lastAccess: lastAccess ? {
          type: lastAccess.type,
          time: lastAccess.createdAt,
          gate: lastAccess.gate,
          timeSince: formatTimeSince(lastAccess.createdAt)
        } : null,
        totalEntries,
        totalExits,
        totalTimeInside: formatDuration(totalTimeInside)
      },
      history: accessHistory.map(a => ({
        id: a.id,
        type: a.type,
        time: a.createdAt,
        gate: a.gate,
        operator: a.operatorName
      })),
      checkedAt: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Access status error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}

function formatTimeSince(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} dia(s) atras`
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}min atras`
  if (diffMins > 0) return `${diffMins} min atras`
  return 'agora'
}

function formatDuration(ms: number): string {
  if (ms === 0) return '0 min'

  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)

  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes} min`
}
