// HikCentral Professional ISAPI Integration
// Uses ISAPI protocol for direct integration

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { parseStringPromise } from 'xml2js';

export class HikCentralISAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private username: string;
  private password: string;

  constructor() {
    this.baseURL = 'https://127.0.0.1';
    this.username = 'admin';
    this.password = 'Index2016';
    
    // Create axios instance with digest auth and self-signed cert support
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      auth: {
        username: this.username,
        password: this.password
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      headers: {
        'Accept': 'application/json, application/xml, text/xml',
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor to handle XML responses
    this.client.interceptors.response.use(
      async (response) => {
        // Convert XML to JSON if needed
        if (response.headers['content-type']?.includes('xml') && typeof response.data === 'string') {
          try {
            response.data = await parseStringPromise(response.data);
          } catch (error) {
            console.log('Could not parse XML response');
          }
        }
        return response;
      },
      (error) => {
        // Handle 401 and retry with different auth methods
        if (error.response?.status === 401) {
          console.log('Authentication failed, may need digest auth');
        }
        return Promise.reject(error);
      }
    );
  }

  // Test ISAPI connection
  async testConnection(): Promise<any> {
    try {
      // Try common ISAPI endpoints
      const endpoints = [
        '/ISAPI/System/deviceInfo',
        '/ISAPI/System/capabilities',
        '/ISAPI/AccessControl/UserInfo/capabilities',
        '/ISAPI/ContentMgmt/InputProxy/channels',
        '/ISAPI/Security/userCheck'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Testing ISAPI endpoint: ${endpoint}`);
          const response = await this.client.get(endpoint);
          
          if (response.status === 200) {
            console.log(`ISAPI endpoint ${endpoint} is accessible`);
            return {
              success: true,
              endpoint: endpoint,
              data: response.data
            };
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            console.log(`Endpoint ${endpoint} returned: ${error.response?.status}`);
          }
          continue;
        }
      }

      throw new Error('No ISAPI endpoints found');
      
    } catch (error: any) {
      throw new Error(`ISAPI connection failed: ${error.message}`);
    }
  }

  // Add user via ISAPI
  async addUser(userData: any): Promise<any> {
    try {
      // HikCentral may use different endpoint structure
      const userInfo = {
        UserInfo: {
          employeeNo: userData.cpf?.replace(/\D/g, '').substring(0, 8),
          name: userData.name,
          userType: 'normal',
          gender: 'unknown',
          Valid: {
            enable: true,
            beginTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          doorRight: '1',
          RightPlan: [{
            doorNo: 1,
            planTemplateNo: '1'
          }]
        }
      };

      // Try different user management endpoints
      const endpoints = [
        '/ISAPI/AccessControl/UserInfo/Record',
        '/ISAPI/AccessControl/UserInfo/SetUp',
        '/ISAPI/AccessControl/UserInfoDetail/Record'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to add user via: ${endpoint}`);
          const response = await this.client.post(
            `${endpoint}?format=json`,
            userInfo
          );
          
          if (response.status === 200 || response.status === 201) {
            console.log('User added successfully via ISAPI');
            return response.data;
          }
        } catch (error: any) {
          console.log(`Failed at ${endpoint}: ${error.response?.status}`);
          continue;
        }
      }

      throw new Error('Failed to add user through ISAPI');
      
    } catch (error: any) {
      throw new Error(`ISAPI addUser failed: ${error.message}`);
    }
  }

  // Search users via ISAPI
  async searchUsers(employeeNo?: string): Promise<any> {
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
      
    } catch (error: any) {
      throw new Error(`ISAPI search failed: ${error.message}`);
    }
  }

  // Get capabilities
  async getCapabilities(): Promise<any> {
    try {
      const response = await this.client.get('/ISAPI/System/capabilities');
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get capabilities: ${error.message}`);
    }
  }
}

export default HikCentralISAPI;