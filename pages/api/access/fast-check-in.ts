import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API: Fast check-in for high-volume registration
 * Optimized for speed - minimal validations
 *
 * POST /api/access/fast-check-in
 * Body: { participantId, eventId, type: 'ENTRY' | 'EXIT', gate?, operatorName? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      participantId,
      eventId,
      type = 'ENTRY', // ENTRY or EXIT
      gate,
      operatorName
    } = req.body

    if (!participantId || !eventId) {
      return res.status(400).json({ error: 'participantId and eventId required' })
    }

    // Single transaction for speed
    const result = await prisma.$transaction(async (tx) => {
      // Get participant name (minimal data)
      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        select: { id: true, name: true, cpf: true }
      })

      if (!participant) {
        throw new Error('Participant not found')
      }

      // Create access log
      const accessLog = await tx.accessLog.create({
        data: {
          participantId,
          eventId,
          type,
          gate,
          operatorName,
          verificationMethod: 'QR_CODE'
        }
      })

      // Update stats with simple increment/decrement
      if (type === 'ENTRY') {
        await tx.accessStats.upsert({
          where: { eventId },
          create: {
            eventId,
            currentInsideCount: 1,
            totalEntries: 1,
            totalExits: 0,
            uniqueVisitors: 1,
            peakCount: 1,
            lastEntryAt: new Date()
          },
          update: {
            currentInsideCount: { increment: 1 },
            totalEntries: { increment: 1 },
            lastEntryAt: new Date()
          }
        })
      } else {
        await tx.accessStats.upsert({
          where: { eventId },
          create: {
            eventId,
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
      }

      return { accessLog, participant }
    })

    return res.status(200).json({
      success: true,
      type,
      participant: result.participant.name,
      time: result.accessLog.createdAt
    })

  } catch (error: any) {
    console.error('Fast check-in error:', error)
    return res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
}
