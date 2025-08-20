import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionClient from '../../../lib/hikvision/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeNo } = req.query;

  if (!employeeNo) {
    return res.status(400).json({ 
      error: 'Missing required parameter',
      required: ['employeeNo']
    });
  }

  try {
    const hikvision = new HikvisionClient();
    
    console.log('Deleting user:', employeeNo);
    
    // Delete user from Hikvision
    const result = await hikvision.deleteUser(employeeNo as string);
    
    console.log('User deleted successfully:', result);
    
    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      employeeNo: employeeNo,
      response: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Failed to delete user:', error);
    
    // Check if user doesn't exist
    let errorMessage = 'Failed to delete user';
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      errorMessage = 'User not found';
      statusCode = 404;
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed';
      statusCode = 401;
    }
    
    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: error.message,
      employeeNo: employeeNo,
      timestamp: new Date().toISOString()
    });
  }
}