import { prisma } from '../../../lib/prisma'
import { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 200);
    const skip = (page - 1) * limit;
    const eventId = req.query.eventId as string | undefined;

    const where: any = {};
    if (eventId) where.eventId = eventId;

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          phone: true,
          createdAt: true,
          approvalStatus: true,
          approvedAt: true,
          approvedBy: true,
          rejectionReason: true,
          hikCentralSyncStatus: true,
          hikCentralErrorMsg: true,
          eventId: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.participant.count({ where })
    ]);

    const mappedParticipants = participants.map(p => ({
      ...p,
      approvalStatus: p.approvalStatus || 'pending'
    }));

    return res.status(200).json({
      success: true,
      participants: mappedParticipants,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error: any) {
    console.error('Error fetching participants:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch participants',
      details: error.message
    });
  } finally {
  }
}
export default withApiAuth(handler, { roles: ADMIN_ROLES })
