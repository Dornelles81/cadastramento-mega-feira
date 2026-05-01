import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const authHeader = req.headers.authorization
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123'
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { participantId, eventId, eventCode } = req.query

  try {
    // Build where clause with proper event filter
    const where: any = {}

    // Filter by participantId if provided
    if (participantId) {
      where.participantId = participantId.toString()
    }

    // Filter by event through participant relation
    if (eventId || eventCode) {
      where.participant = {}

      if (eventId) {
        where.participant.eventId = eventId.toString()
      } else if (eventCode) {
        where.participant.eventCode = eventCode.toString()
      }
    }

    console.log('🔍 Approval logs query:', { where, eventId, eventCode })

    const logs = await prisma.approvalLog.findMany({
      where,
      include: {
        participant: {
          select: {
            name: true,
            cpf: true,
            email: true,
            eventCode: true,
            eventId: true,
            event: {
              select: {
                name: true,
                code: true,
                slug: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 logs
    })

    console.log(`✅ Found ${logs.length} approval logs`)

    res.status(200).json({ logs })

  } catch (error: any) {
    console.error('Error fetching approval logs:', error)
    res.status(500).json({ error: 'Failed to fetch approval logs', details: error.message })
  } finally {
  }
}