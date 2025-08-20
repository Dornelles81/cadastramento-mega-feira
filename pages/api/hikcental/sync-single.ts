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
    // Validate admin authentication (simplified for now)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ error: 'Participant ID is required' });
    }

    // Check if participant exists
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Initialize service
    await hikCentralService.initialize();

    // Sync participant
    const result = await hikCentralService.syncParticipant(participantId);

    // Log admin action
    await prisma.auditLog.create({
      data: {
        action: 'HIKCENTAL_SYNC_SINGLE',
        entityType: 'participant',
        entityId: participantId,
        adminUser: 'admin', // Get from auth
        adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
        newData: result as any,
        description: `Manual sync of participant ${participant.name} to HikCentral`
      }
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Participant synced successfully',
        hikCentralPersonId: result.hikCentralPersonId,
        participantId: result.participantId
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Sync failed',
        error: result.errorMessage,
        errorCode: result.errorCode
      });
    }

  } catch (error: any) {
    console.error('HikCentral sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}