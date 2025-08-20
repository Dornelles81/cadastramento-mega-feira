import { NextApiRequest, NextApiResponse } from 'next';
import HikCentralPuppeteer from '../../../lib/hikcental/hikcentral-puppeteer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const puppeteer = new HikCentralPuppeteer();

  try {
    console.log('\n=== Testing HikCentral Browser Automation ===\n');
    
    console.log('Testing connection and login...');
    const testResult = await puppeteer.testConnection();
    
    console.log('✅ Browser automation is working!');
    
    // Disconnect after test
    await puppeteer.disconnect();
    
    return res.status(200).json({
      success: true,
      message: 'HikCentral browser automation is ready',
      details: testResult,
      nextSteps: [
        'Browser automation configured successfully',
        'Login to HikCentral works',
        'Ready to add visitors through web interface',
        'Try approving a participant now'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Puppeteer test failed:', error);
    
    // Make sure to disconnect on error
    await puppeteer.disconnect();
    
    return res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check if HikCentral is accessible at https://127.0.0.1/portal',
      timestamp: new Date().toISOString()
    });
  }
}