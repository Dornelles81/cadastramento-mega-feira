import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { HikCentralService } from '../../../lib/hikcental/service';

const prisma = new PrismaClient();
const hikCentralService = new HikCentralService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { participantId, batchId } = req.query;

    if (participantId) {
      // Get status for specific participant
      const status = await hikCentralService.getParticipantSyncStatus(participantId as string);
      
      const syncLogs = await prisma.hikCentralSyncLog.findMany({
        where: { participantId: participantId as string },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      return res.status(200).json({
        success: true,
        participant: status,
        syncHistory: syncLogs
      });
      
    } else if (batchId) {
      // Get batch status
      const batch = await prisma.hikCentralSyncBatch.findUnique({
        where: { id: batchId as string }
      });

      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      const batchLogs = await prisma.hikCentralSyncLog.findMany({
        where: { batchId: batchId as string },
        orderBy: { batchPosition: 'asc' },
        select: {
          participantId: true,
          syncStatus: true,
          hikCentralPersonId: true,
          errorMessage: true,
          duration: true
        }
      });

      return res.status(200).json({
        success: true,
        batch,
        logs: batchLogs
      });
      
    } else {
      // Get overall sync status
      const stats = await prisma.participant.groupBy({
        by: ['hikCentralSyncStatus'],
        _count: true
      });

      const recentBatches = await prisma.hikCentralSyncBatch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const recentLogs = await prisma.hikCentralSyncLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          participant: {
            select: {
              name: true,
              cpf: true
            }
          }
        }
      });

      // Test HikCentral connection
      let connectionStatus = 'unknown';
      try {
        await hikCentralService.initialize();
        connectionStatus = 'connected';
      } catch (error) {
        connectionStatus = 'disconnected';
      }

      // Get configuration
      const config = await prisma.hikCentralConfig.findFirst({
        where: { isActive: true }
      });

      return res.status(200).json({
        success: true,
        connectionStatus,
        statistics: stats,
        recentBatches,
        recentLogs,
        configuration: config ? {
          baseUrl: config.baseUrl,
          authType: config.authType,
          batchSize: config.batchSize,
          autoSync: config.autoSync,
          syncInterval: config.syncInterval
        } : null
      });
    }

  } catch (error: any) {
    console.error('HikCentral status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}