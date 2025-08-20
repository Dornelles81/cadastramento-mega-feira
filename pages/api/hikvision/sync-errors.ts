import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get participants with sync errors
    const participantsWithErrors = await prisma.participant.findMany({
      where: {
        hikCentralSyncStatus: 'failed'
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        approvalStatus: true,
        approvedAt: true,
        hikCentralSyncStatus: true,
        hikCentralErrorMsg: true,
        hikCentralSyncedAt: true,
        createdAt: true
      },
      orderBy: {
        hikCentralSyncedAt: 'desc'
      }
    });

    // Get recent sync logs with errors
    const recentErrors = await prisma.hikCentralSyncLog.findMany({
      where: {
        syncStatus: 'failed'
      },
      include: {
        participant: {
          select: {
            name: true,
            cpf: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    // Get statistics
    const stats = await prisma.participant.groupBy({
      by: ['hikCentralSyncStatus'],
      _count: {
        hikCentralSyncStatus: true
      }
    });

    const statsMap = {
      synced: 0,
      failed: 0,
      pending: 0,
      syncing: 0
    };

    stats.forEach(stat => {
      if (stat.hikCentralSyncStatus) {
        statsMap[stat.hikCentralSyncStatus as keyof typeof statsMap] = stat._count.hikCentralSyncStatus;
      }
    });

    return res.status(200).json({
      participantsWithErrors,
      recentErrors,
      statistics: statsMap,
      totalErrors: participantsWithErrors.length
    });

  } catch (error: any) {
    console.error('Error fetching sync errors:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch sync errors',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}