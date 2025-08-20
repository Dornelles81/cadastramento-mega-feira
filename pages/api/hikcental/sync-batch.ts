import type { NextApiRequest, NextApiResponse } from 'next';
import { HikCentralService } from '../../../lib/hikcental/service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const hikCentralService = new HikCentralService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { participantIds, filters } = req.body;

    let idsToSync: string[] = [];

    if (participantIds && Array.isArray(participantIds)) {
      // Use provided IDs
      idsToSync = participantIds;
    } else if (filters) {
      // Apply filters to get participants
      const whereClause: any = {};
      
      if (filters.status) {
        whereClause.hikCentralSyncStatus = filters.status;
      }
      
      if (filters.eventCode) {
        whereClause.eventCode = filters.eventCode;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        whereClause.createdAt = {};
        if (filters.dateFrom) {
          whereClause.createdAt.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          whereClause.createdAt.lte = new Date(filters.dateTo);
        }
      }
      
      if (filters.onlyFailed) {
        whereClause.hikCentralSyncStatus = 'failed';
      }
      
      if (filters.onlyPending) {
        whereClause.OR = [
          { hikCentralSyncStatus: 'pending' },
          { hikCentralSyncStatus: null }
        ];
      }

      const participants = await prisma.participant.findMany({
        where: whereClause,
        select: { id: true }
      });
      
      idsToSync = participants.map(p => p.id);
    } else {
      return res.status(400).json({ 
        error: 'Either participantIds or filters must be provided' 
      });
    }

    if (idsToSync.length === 0) {
      return res.status(400).json({ 
        error: 'No participants found matching criteria' 
      });
    }

    // Initialize service
    await hikCentralService.initialize();

    // Start batch sync
    const result = await hikCentralService.syncBatch(idsToSync);

    // Log admin action
    await prisma.auditLog.create({
      data: {
        action: 'HIKCENTAL_SYNC_BATCH',
        entityType: 'batch_sync',
        entityId: result.batchId,
        adminUser: 'admin',
        adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
        newData: {
          totalParticipants: result.totalProcessed,
          successCount: result.successCount,
          failedCount: result.failedCount,
          filters
        } as any,
        description: `Batch sync of ${result.totalProcessed} participants to HikCentral`
      }
    });

    return res.status(200).json({
      success: true,
      message: `Batch sync completed`,
      batchId: result.batchId,
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failedCount: result.failedCount,
      duration: result.duration,
      results: result.results
    });

  } catch (error: any) {
    console.error('HikCentral batch sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}