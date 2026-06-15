import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
export default withApiAuth(handler, { roles: ADMIN_ROLES })
