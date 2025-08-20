import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionClient from '../../../lib/hikvision/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Testing Hikvision connection...');
    console.log('Device IP:', process.env.HIKVISION_DEVICE_IP);
    console.log('User:', process.env.HIKVISION_USER);
    
    const hikvision = new HikvisionClient();
    
    // Test 1: Get device info
    console.log('Getting device info...');
    const deviceInfo = await hikvision.getDeviceInfo();
    
    // Test 2: Get user count
    console.log('Getting user count...');
    let userCount = null;
    try {
      userCount = await hikvision.getUserCount();
    } catch (error) {
      console.log('User count not available:', error);
    }
    
    // Test 3: Search for existing users
    console.log('Searching for users...');
    let users = null;
    try {
      users = await hikvision.searchUsers();
    } catch (error) {
      console.log('User search not available:', error);
    }
    
    return res.status(200).json({
      success: true,
      connection: 'Connected successfully!',
      device: {
        ip: process.env.HIKVISION_DEVICE_IP,
        type: process.env.HIKVISION_DEVICE_TYPE || 'DS-K1T671M-L',
        info: deviceInfo
      },
      statistics: {
        userCount: userCount,
        users: users
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Hikvision connection test failed:', error);
    
    // Detailed error response
    let errorMessage = 'Connection failed';
    let errorDetails = error.message;
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - Terminal may be offline or IP is incorrect';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout - Terminal not reachable on network';
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed - Check username and password';
    } else if (error.response?.status === 404) {
      errorMessage = 'API endpoint not found - Terminal may not support this feature';
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      device: {
        ip: process.env.HIKVISION_DEVICE_IP,
        user: process.env.HIKVISION_USER,
        passwordConfigured: !!process.env.HIKVISION_PASSWORD
      },
      troubleshooting: [
        '1. Verify the terminal IP address is correct (192.168.1.20)',
        '2. Ensure the terminal is powered on and connected to network',
        '3. Check if you can ping the terminal: ping 192.168.1.20',
        '4. Verify username (admin) and password are correct',
        '5. Ensure the terminal firmware supports ISAPI',
        '6. Check if web interface is accessible: http://192.168.1.20'
      ]
    });
  }
}