import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API: Register participant entry (check-in)
 *
 * POST /api/access/check-in
 * Body: { participantId, eventId, gate?, operatorName?, notes?, requirePreviousExit? }
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
      requirePreviousExit = true, // If true, only allow entry if last action was exit or no action
      forceEntry = false // If true, skip approval check (admin override)
    } = req.body

    if (!participantId) {
      return res.status(400).json({ error: 'participantId is required' })
    }

    // Get participant with event info
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        event: {
          select: { id: true, name: true, code: true, slug: true, status: true }
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

    // Check if participant is approved (skip if forceEntry is true)
    if (!forceEntry && participant.approvalStatus !== 'approved') {
      return res.status(403).json({
        error: 'Participant not approved',
        message: `Status: ${participant.approvalStatus || 'pending'}. Use "Forcar entrada" para ignorar.`,
        participant: {
          id: participant.id,
          name: participant.name,
          status: participant.approvalStatus
        }
      })
    }

    // Check last access to enforce entry/exit rules
    const lastAccess = await prisma.accessLog.findFirst({
      where: { participantId },
      orderBy: { createdAt: 'desc' }
    })

    const isCurrentlyInside = lastAccess?.type === 'ENTRY'

    if (requirePreviousExit && isCurrentlyInside) {
      return res.status(400).json({
        error: 'Already inside',
        message: 'Participante ja registrou entrada. Registre a saida primeiro.',
        lastAccess: {
          type: lastAccess.type,
          time: lastAccess.createdAt,
          gate: lastAccess.gate
        },
        participant: {
          id: participant.id,
          name: participant.name
        }
      })
    }

    // Get client IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''

    // Register entry
    const accessLog = await prisma.accessLog.create({
      data: {
        participantId,
        eventId: targetEventId,
        type: 'ENTRY',
        gate,
        location,
        operatorId,
        operatorName,
        operatorEmail,
        deviceId,
        deviceName,
        deviceIp: typeof clientIp === 'string' ? clientIp : clientIp[0],
        verificationMethod,
        notes
      }
    })

    // Update or create access stats
    await prisma.accessStats.upsert({
      where: { eventId: targetEventId },
      create: {
        eventId: targetEventId,
        currentInsideCount: 1,
        totalEntries: 1,
        totalExits: 0,
        uniqueVisitors: 1,
        peakCount: 1,
        peakTime: new Date(),
        lastEntryAt: new Date()
      },
      update: {
        currentInsideCount: { increment: 1 },
        totalEntries: { increment: 1 },
        lastEntryAt: new Date()
      }
    })

    // Update peak if needed
    const stats = await prisma.accessStats.findUnique({
      where: { eventId: targetEventId }
    })

    if (stats && stats.currentInsideCount > stats.peakCount) {
      await prisma.accessStats.update({
        where: { eventId: targetEventId },
        data: {
          peakCount: stats.currentInsideCount,
          peakTime: new Date()
        }
      })
    }

    // Count unique visitors
    const uniqueCount = await prisma.accessLog.groupBy({
      by: ['participantId'],
      where: { eventId: targetEventId, type: 'ENTRY' },
      _count: true
    })

    await prisma.accessStats.update({
      where: { eventId: targetEventId },
      data: { uniqueVisitors: uniqueCount.length }
    })

    return res.status(200).json({
      success: true,
      message: 'Entrada registrada com sucesso',
      accessLog: {
        id: accessLog.id,
        type: accessLog.type,
        time: accessLog.createdAt,
        gate: accessLog.gate
      },
      participant: {
        id: participant.id,
        name: participant.name,
        cpf: participant.cpf,
        faceImageUrl: participant.faceImageUrl,
        stand: participant.stand?.name || participant.stand?.code,
        event: participant.event?.name
      }
    })

  } catch (error: any) {
    console.error('Check-in error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
