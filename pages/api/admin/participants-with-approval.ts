import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch all participants with approval status
    const participants = await prisma.participant.findMany({
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
        faceImageUrl: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Map participants to ensure all have proper approval status
    const mappedParticipants = participants.map(p => ({
      ...p,
      approvalStatus: p.approvalStatus || 'pending'
    }));

    return res.status(200).json({
      success: true,
      participants: mappedParticipants,
      total: mappedParticipants.length
    });

  } catch (error: any) {
    console.error('Error fetching participants:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch participants',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}