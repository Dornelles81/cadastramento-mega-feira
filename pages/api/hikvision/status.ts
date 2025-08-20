import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionService from '../../../lib/hikvision/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const service = new HikvisionService();
    const status = await service.getSyncStatus();
    
    res.status(200).json(status);
  } catch (error) {
    console.error('Status API error:', error);
    res.status(500).json({ 
      error: 'Failed to get status',
      message: error.message 
    });
  }
}