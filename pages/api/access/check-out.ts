import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API: Register participant exit (check-out)
 *
 * POST /api/access/check-out
 * Body: { participantId, eventId, gate?, operatorName?, notes? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      participantId,
      eventId,
      gate,
      location,
      operatorId,
      operatorName,
      operatorEmail,
      deviceId,
      deviceName,
      verificationMethod = 'QR_CODE',
      notes,
      forceExit = false // If true, skip "must be inside" check (admin override)
    } = req.body

    if (!participantId) {
      return res.status(400).json({ error: 'participantId is required' })
    }

    // Get participant with event info
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        event: {
          select: { id: true, name: true, code: true, slug: true }
        },
        stand: {
          select: { code: true, name: true }
        }
      }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    const targetEventId = eventId || participant.eventId

    if (!targetEventId) {
      return res.status(400).json({ error: 'Event ID not found for participant' })
    }

    // Check last access
    const lastAccess = await prisma.accessLog.findFirst({
      where: { participantId },
      orderBy: { createdAt: 'desc' }
    })

    const isCurrentlyInside = lastAccess?.type === 'ENTRY'

    if (!forceExit && !isCurrentlyInside) {
      return res.status(400).json({
        error: 'Not inside',
        message: 'Participante nao possui entrada registrada. Use "Forcar entrada" para ignorar.',
        lastAccess: lastAccess ? {
          type: lastAccess.type,
          time: lastAccess.createdAt,
          gate: lastAccess.gate
        } : null,
        participant: {
          id: participant.id,
          name: participant.name
        }
      })
    }

    // Calculate duration inside (if there was an entry)
    const entryTime = lastAccess?.createdAt || new Date()
    const exitTime = new Date()
    const durationMs = exitTime.getTime() - entryTime.getTime()
    const durationMinutes = Math.round(durationMs / 60000)

    // Get client IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''

    // Register exit
    const accessLog = await prisma.accessLog.create({
      data: {
        participantId,
        eventId: targetEventId,
        type: 'EXIT',
        gate,
        location,
        operatorId,
        operatorName,
        operatorEmail,
        deviceId,
        deviceName,
        deviceIp: typeof clientIp === 'string' ? clientIp : clientIp[0],
        verificationMethod,
        notes: notes || `Permanencia: ${durationMinutes} minutos`
      }
    })

    // Update access stats
    await prisma.accessStats.upsert({
      where: { eventId: targetEventId },
      create: {
        eventId: targetEventId,
        currentInsideCount: 0,
        totalEntries: 0,
        totalExits: 1,
        uniqueVisitors: 0,
        lastExitAt: new Date()
      },
      update: {
        currentInsideCount: { decrement: 1 },
        totalExits: { increment: 1 },
        lastExitAt: new Date()
      }
    })

    // Ensure currentInsideCount doesn't go negative
    const stats = await prisma.accessStats.findUnique({
      where: { eventId: targetEventId }
    })

    if (stats && stats.currentInsideCount < 0) {
      await prisma.accessStats.update({
        where: { eventId: targetEventId },
        data: { currentInsideCount: 0 }
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Saida registrada com sucesso',
      accessLog: {
        id: accessLog.id,
        type: accessLog.type,
        time: accessLog.createdAt,
        gate: accessLog.gate
      },
      duration: {
        minutes: durationMinutes,
        formatted: formatDuration(durationMs)
      },
      participant: {
        id: participant.id,
        name: participant.name,
        cpf: participant.cpf,
        stand: participant.stand?.name || participant.stand?.code,
        event: participant.event?.name
      }
    })

  } catch (error: any) {
    console.error('Check-out error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)

  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes} min`
}
