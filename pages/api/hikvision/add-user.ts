import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionClient from '../../../lib/hikvision/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, employeeNo, userType, validFrom, validTo } = req.body;

  if (!name || !employeeNo) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['name', 'employeeNo']
    });
  }

  try {
    const hikvision = new HikvisionClient();
    
    // First test connection
    console.log('Testing connection before adding user...');
    await hikvision.getDeviceInfo();
    console.log('Connection OK, proceeding to add user...');
    
    // Prepare user data
    const userData = {
      employeeNo: String(employeeNo).substring(0, 8), // Ensure max 8 chars
      name: name,
      userType: userType || 'normal',
      valid: {
        enable: true,
        beginTime: validFrom ? new Date(validFrom).toISOString() : new Date().toISOString(),
        endTime: validTo ? new Date(validTo).toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
    
    console.log('Adding user with data:', userData);
    
    // Add user to Hikvision
    const result = await hikvision.addUser(userData);
    
    console.log('User added successfully:', result);
    
    return res.status(200).json({
      success: true,
      message: 'User added successfully',
      user: userData,
      response: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Failed to add user:', error);
    
    // Detailed error analysis
    let errorMessage = 'Failed to add user';
    let errorDetails = error.message;
    let statusCode = 500;
    
    if (error.response?.status === 401) {
      errorMessage = 'Authentication failed - Cannot add user';
      errorDetails = 'The terminal rejected the credentials. Digest authentication may be required.';
      statusCode = 401;
    } else if (error.response?.status === 403) {
      errorMessage = 'Permission denied - User may not have admin rights';
      statusCode = 403;
    } else if (error.response?.status === 400) {
      errorMessage = 'Invalid user data';
      errorDetails = error.response?.data || 'The terminal rejected the user data format';
      statusCode = 400;
    } else if (error.response?.status === 409) {
      errorMessage = 'User already exists';
      errorDetails = `Employee number ${employeeNo} is already registered`;
      statusCode = 409;
    }
    
    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      request: {
        name,
        employeeNo: String(employeeNo).substring(0, 8),
        userType: userType || 'normal'
      },
      timestamp: new Date().toISOString()
    });
  }
}