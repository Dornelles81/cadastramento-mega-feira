import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionService from '../../../lib/hikvision/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const service = new HikvisionService();
    const { participantId, participantIds, syncAll } = req.body;

    let result;

    if (syncAll) {
      // Sync all pending participants
      result = await service.syncPendingParticipants();
    } else if (participantIds && Array.isArray(participantIds)) {
      // Sync multiple participants
      result = await service.syncBatch(participantIds);
    } else if (participantId) {
      // Sync single participant
      result = await service.syncParticipant(participantId);
    } else {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Provide participantId, participantIds array, or syncAll flag' 
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Sync API error:', error);
    res.status(500).json({ 
      error: 'Sync failed',
      message: error.message 
    });
  }
}