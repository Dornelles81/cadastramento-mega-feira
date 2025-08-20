// Hikvision Access Controller Client
// For DS-K1T671M-L Face Recognition Terminal

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { DigestAuth } from './digest-auth';

export interface HikvisionUser {
  employeeNo: string;
  name: string;
  userType?: 'normal' | 'visitor' | 'blackList';
  password?: string;
  valid?: {
    enable: boolean;
    beginTime: string;
    endTime: string;
  };
  gender?: 'male' | 'female' | 'unknown';
  roomNumber?: number;
  floorNumber?: number;
}

export interface HikvisionFace {
  employeeNo: string;
  faceDataRecord: {
    faceData: string; // Base64 encoded face image
  };
}

export class HikvisionClient {
  private client: AxiosInstance;
  private digestAuth: DigestAuth | null = null;
  private baseURL: string;
  private username: string;
  private password: string;

  constructor() {
    this.baseURL = `http://${process.env.HIKVISION_DEVICE_IP}`;
    this.username = process.env.HIKVISION_USER || 'admin';
    this.password = process.env.HIKVISION_PASSWORD || '';

    // Create digest auth instance
    try {
      this.digestAuth = new DigestAuth(this.username, this.password);
    } catch (error) {
      console.warn('DigestAuth initialization failed, will use basic auth only');
      this.digestAuth = null;
    }

    // Create axios instance (will try basic auth first)
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      auth: {
        username: this.username,
        password: this.password
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/xml'
      },
      // Handle self-signed certificates
      httpsAgent: process.env.NODE_ENV === 'development' ? new (require('https').Agent)({
        rejectUnauthorized: false
      }) : undefined
    });
  }

  // Get device information  
  async getDeviceInfo() {
    try {
      // First try with digest auth if available
      if (this.digestAuth) {
        console.log('Attempting to get device info with digest auth...');
        
        try {
          const response = await this.digestAuth.request({
            method: 'GET',
            url: `${this.baseURL}/ISAPI/System/deviceInfo`,
            headers: {
              'Accept': 'application/xml'
            },
            timeout: 30000
          });
          
          console.log('Success with digest auth!');
          return response.data;
        } catch (digestError: any) {
          console.log('Digest auth failed, trying basic auth...');
        }
      }
      
      // Fallback to basic auth
      const response = await this.client.get('/ISAPI/System/deviceInfo');
      console.log('Success with basic auth!');
      return response.data;
      
    } catch (error) {
      console.error('Error getting device info:', error);
      throw error;
    }
  }

  // Get user count
  async getUserCount() {
    try {
      const response = await this.client.get('/ISAPI/AccessControl/UserInfo/Count');
      return response.data;
    } catch (error) {
      console.error('Error getting user count:', error);
      throw error;
    }
  }

  // Search users
  async searchUsers(employeeNo?: string) {
    try {
      const searchData = {
        UserInfoSearchCond: {
          searchID: '1',
          maxResults: 30,
          searchResultPosition: 0,
          ...(employeeNo && {
            EmployeeNoList: {
              employeeNo: [employeeNo]
            }
          })
        }
      };

      const response = await this.client.post(
        '/ISAPI/AccessControl/UserInfo/Search?format=json',
        searchData
      );
      
      return response.data;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }

  // Add or update user
  async addUser(user: HikvisionUser) {
    try {
      const userData = {
        UserInfo: {
          employeeNo: user.employeeNo,
          name: user.name,
          userType: user.userType || 'normal',
          ...(user.password && { password: user.password }),
          Valid: user.valid || {
            enable: true,
            beginTime: '2025-01-01T00:00:00',
            endTime: '2037-12-31T23:59:59'
          },
          ...(user.gender && { gender: user.gender }),
          ...(user.roomNumber && { roomNumber: user.roomNumber }),
          ...(user.floorNumber && { floorNumber: user.floorNumber }),
          doorRight: '1', // Default door access
          RightPlan: [
            {
              doorNo: 1,
              planTemplateNo: '1'
            }
          ]
        }
      };

      // Try with digest auth first if available
      if (this.digestAuth) {
        console.log('Attempting to add user with digest auth...');
        
        try {
          const response = await this.digestAuth.request({
            method: 'POST',
            url: `${this.baseURL}/ISAPI/AccessControl/UserInfo/Record?format=json`,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            data: userData,
            timeout: 30000
          });
          
          console.log('User added successfully with digest auth');
          return response.data;
        } catch (digestError: any) {
          console.log('Digest auth failed for addUser, trying basic auth...');
        }
      }
      
      // Fallback to basic auth
      const response = await this.client.post(
        '/ISAPI/AccessControl/UserInfo/Record?format=json',
        userData
      );
      
      console.log('User added successfully with basic auth');
      return response.data;
    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  }

  // Upload face data
  async uploadFace(employeeNo: string, faceImage: string) {
    try {
      // Remove data:image prefix if present
      const base64Data = faceImage.replace(/^data:image\/\w+;base64,/, '');
      
      const faceData = {
        FaceDataRecord: {
          faceLibType: 'blackFD',
          FDID: '1',
          FPID: employeeNo,
          faceData: base64Data
        }
      };

      // Try with digest auth first if available
      if (this.digestAuth) {
        console.log('Attempting to upload face with digest auth...');
        
        try {
          const response = await this.digestAuth.request({
            method: 'POST',
            url: `${this.baseURL}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            data: faceData,
            timeout: 30000
          });
          
          console.log('Face uploaded successfully with digest auth');
          return response.data;
        } catch (digestError: any) {
          console.log('Digest auth failed for uploadFace, trying basic auth...');
        }
      }
      
      // Fallback to basic auth
      const response = await this.client.post(
        '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
        faceData
      );
      
      console.log('Face uploaded successfully with basic auth');
      return response.data;
    } catch (error) {
      console.error('Error uploading face:', error);
      throw error;
    }
  }

  // Delete user
  async deleteUser(employeeNo: string) {
    try {
      const deleteData = {
        UserInfoDelCond: {
          EmployeeNoList: {
            employeeNo: [employeeNo]
          }
        }
      };

      const response = await this.client.put(
        '/ISAPI/AccessControl/UserInfo/Delete?format=json',
        deleteData,
        {
          auth: {
            username: this.username,
            password: this.password
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // Get access logs
  async getAccessLogs(startTime?: string, endTime?: string) {
    try {
      const now = new Date();
      const searchData = {
        AcsEventCond: {
          searchID: '1',
          searchResultPosition: 0,
          maxResults: 30,
          major: 0x5,
          minor: 0x4b,
          startTime: startTime || new Date(now.getTime() - 24*60*60*1000).toISOString(),
          endTime: endTime || now.toISOString()
        }
      };

      const response = await this.client.post(
        '/ISAPI/AccessControl/AcsEvent?format=json',
        searchData,
        {
          auth: {
            username: this.username,
            password: this.password
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting access logs:', error);
      throw error;
    }
  }

  // Open door remotely
  async openDoor(doorNo: number = 1) {
    try {
      const controlData = {
        RemoteControlDoor: {
          cmd: 'open',
          channelNo: doorNo
        }
      };

      const response = await this.client.put(
        `/ISAPI/AccessControl/RemoteControl/door/${doorNo}?format=json`,
        controlData,
        {
          auth: {
            username: this.username,
            password: this.password
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error opening door:', error);
      throw error;
    }
  }
}

export default HikvisionClient;