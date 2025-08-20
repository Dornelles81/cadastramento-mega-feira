import { NextApiRequest, NextApiResponse } from 'next';
import HikvisionClient from '../../../lib/hikvision/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeNo } = req.query;

  try {
    const hikvision = new HikvisionClient();
    
    console.log('Searching for user:', employeeNo || 'all users');
    
    // Search for users
    const result = await hikvision.searchUsers(employeeNo as string);
    
    // Parse response
    let users = [];
    if (result?.UserInfoSearch?.UserInfo) {
      // Handle single user or array of users
      const userInfo = result.UserInfoSearch.UserInfo;
      users = Array.isArray(userInfo) ? userInfo : [userInfo];
    }
    
    return res.status(200).json({
      success: true,
      message: users.length > 0 ? 'Users found' : 'No users found',
      users: users.map(user => ({
        employeeNo: user.employeeNo,
        name: user.name,
        userType: user.userType,
        valid: user.Valid,
        gender: user.gender,
        roomNumber: user.roomNumber,
        floorNumber: user.floorNumber
      })),
      total: users.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Failed to search users:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to search users',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}