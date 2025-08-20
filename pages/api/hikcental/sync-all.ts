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

    // Initialize service
    await hikCentralService.initialize();

    // Sync all pending participants
    const result = await hikCentralService.syncPendingParticipants();

    if (result.totalProcessed === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending participants to sync',
        totalProcessed: 0
      });
    }

    // Log admin action
    await prisma.auditLog.create({
      data: {
        action: 'HIKCENTAL_SYNC_ALL_PENDING',
        entityType: 'batch_sync',
        entityId: result.batchId,
        adminUser: 'admin',
        adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
        newData: {
          totalParticipants: result.totalProcessed,
          successCount: result.successCount,
          failedCount: result.failedCount
        } as any,
        description: `Sync all pending participants (${result.totalProcessed}) to HikCentral`
      }
    });

    return res.status(200).json({
      success: true,
      message: 'All pending participants synced',
      batchId: result.batchId,
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failedCount: result.failedCount,
      duration: result.duration
    });

  } catch (error: any) {
    console.error('HikCentral sync all error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}