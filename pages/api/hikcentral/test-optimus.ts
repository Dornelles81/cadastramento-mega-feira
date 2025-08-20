import { NextApiRequest, NextApiResponse } from 'next';
import OptimusClient from '../../../lib/hikcental/optimus-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('\n=== Testing Optimus Integration ===\n');
    
    const optimus = new OptimusClient();
    
    console.log('Testing Optimus connection...');
    const testResult = await optimus.testConnection();
    
    console.log('✅ Optimus integration is working!');
    
    return res.status(200).json({
      success: true,
      message: 'Optimus integration is active',
      details: testResult,
      nextSteps: [
        'The integration is ready to use',
        'Approve a participant to test the sync',
        'Check if the participant appears in HikCentral',
        'Verify sync with the terminal'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Optimus test failed:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Make sure you saved the Optimus Integration settings in HikCentral',
      timestamp: new Date().toISOString()
    });
  }
}