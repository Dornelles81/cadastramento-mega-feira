// HikCentral Access Control Platform Client
// For integration with HikCentral software

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

export interface HikCentralPerson {
  personId?: string;
  personCode: string; // Employee number/CPF
  personName: string;
  gender?: 0 | 1 | 2; // 0: Unknown, 1: Male, 2: Female
  orgIndexCode?: string; // Organization code
  birthday?: string;
  phoneNo?: string;
  email?: string;
  certificateType?: string; // '111' for CPF
  certificateNo?: string; // CPF number
  jobNo?: string;
  faces?: HikCentralFace[];
}

export interface HikCentralFace {
  faceId?: string;
  faceData: string; // Base64 encoded image
  facePicType?: 1 | 2; // 1: Certificate photo, 2: Captured photo
}

export interface HikCentralAuthConfig {
  host: string;
  port?: number;
  appKey: string;
  appSecret: string;
  useHttps?: boolean;
}

export class HikCentralClient {
  private client: AxiosInstance;
  private config: HikCentralAuthConfig;
  private baseURL: string;

  constructor(config?: Partial<HikCentralAuthConfig>) {
    // Default configuration for local HikCentral Professional
    this.config = {
      host: config?.host || process.env.HIKCENTRAL_HOST || '127.0.0.1',
      port: config?.port || parseInt(process.env.HIKCENTRAL_PORT || '443'),
      appKey: config?.appKey || process.env.HIKCENTRAL_APP_KEY || 'admin',
      appSecret: config?.appSecret || process.env.HIKCENTRAL_APP_SECRET || 'Index2016',
      useHttps: config?.useHttps !== undefined ? config.useHttps : true
    };

    const protocol = this.config.useHttps ? 'https' : 'http';
    this.baseURL = `${protocol}://${this.config.host}:${this.config.port}/artemis`;

    // Configure axios with HTTPS agent to handle self-signed certificates
    const httpsAgent = this.config.useHttps ? new (require('https').Agent)({
      rejectUnauthorized: false // Accept self-signed certificates
    }) : undefined;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      httpsAgent: httpsAgent
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const headers = this.generateAuthHeaders(
        config.method?.toUpperCase() || 'GET',
        config.url || '',
        config.data ? JSON.stringify(config.data) : ''
      );
      config.headers = { ...config.headers, ...headers };
      return config;
    });
  }

  // Generate HMAC-SHA256 signature for HikCentral API
  private generateAuthHeaders(method: string, path: string, body: string = ''): any {
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Create signature string
    const signStr = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
    
    // Generate HMAC-SHA256
    const signature = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(signStr)
      .digest('base64');

    return {
      'X-Ca-Key': this.config.appKey,
      'X-Ca-Signature': signature,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp,x-ca-nonce'
    };
  }

  // Test connection to HikCentral
  async testConnection() {
    try {
      // Try to get system time as a simple test
      const response = await this.client.get('/api/common/v1/system/time');
      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error('HikCentral connection test failed:', error);
      throw error;
    }
  }

  // Add person to HikCentral
  async addPerson(person: HikCentralPerson) {
    try {
      const response = await this.client.post(
        '/api/resource/v2/person/single/add',
        person
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          personId: response.data.data?.personId,
          message: response.data.msg
        };
      } else {
        throw new Error(response.data.msg || 'Failed to add person');
      }
    } catch (error: any) {
      console.error('Error adding person to HikCentral:', error);
      throw error;
    }
  }

  // Update person in HikCentral
  async updatePerson(person: HikCentralPerson) {
    try {
      const response = await this.client.post(
        '/api/resource/v2/person/single/update',
        person
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          message: response.data.msg
        };
      } else {
        throw new Error(response.data.msg || 'Failed to update person');
      }
    } catch (error: any) {
      console.error('Error updating person in HikCentral:', error);
      throw error;
    }
  }

  // Add face to person
  async addFace(personId: string, faceImage: string) {
    try {
      const response = await this.client.post(
        '/api/resource/v1/face/single/add',
        {
          personId: personId,
          faceData: faceImage.replace(/^data:image\/\w+;base64,/, ''),
          facePicType: 2 // Captured photo
        }
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          faceId: response.data.data?.faceId,
          message: response.data.msg
        };
      } else {
        throw new Error(response.data.msg || 'Failed to add face');
      }
    } catch (error: any) {
      console.error('Error adding face to HikCentral:', error);
      throw error;
    }
  }

  // Search person by code (CPF)
  async searchPerson(personCode: string) {
    try {
      const response = await this.client.post(
        '/api/resource/v2/person/advance/personList',
        {
          pageNo: 1,
          pageSize: 10,
          personCode: personCode
        }
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          persons: response.data.data?.list || [],
          total: response.data.data?.total || 0
        };
      } else {
        throw new Error(response.data.msg || 'Failed to search person');
      }
    } catch (error: any) {
      console.error('Error searching person in HikCentral:', error);
      throw error;
    }
  }

  // Delete person from HikCentral
  async deletePerson(personId: string) {
    try {
      const response = await this.client.post(
        '/api/resource/v2/person/batch/delete',
        {
          personIds: [personId]
        }
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          message: response.data.msg
        };
      } else {
        throw new Error(response.data.msg || 'Failed to delete person');
      }
    } catch (error: any) {
      console.error('Error deleting person from HikCentral:', error);
      throw error;
    }
  }

  // Assign access permissions to person
  async assignAccessPermission(personId: string, resourceIndexCodes: string[]) {
    try {
      const response = await this.client.post(
        '/api/acps/v1/auth_config/add',
        {
          personIds: [personId],
          resourceIndexCodes: resourceIndexCodes, // Device/door codes
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
        }
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          message: response.data.msg
        };
      } else {
        throw new Error(response.data.msg || 'Failed to assign permissions');
      }
    } catch (error: any) {
      console.error('Error assigning permissions in HikCentral:', error);
      throw error;
    }
  }

  // Get access control devices
  async getDevices() {
    try {
      const response = await this.client.post(
        '/api/resource/v1/acsDevice/acsDeviceList',
        {
          pageNo: 1,
          pageSize: 100
        }
      );
      
      if (response.data.code === '0') {
        return {
          success: true,
          devices: response.data.data?.list || [],
          total: response.data.data?.total || 0
        };
      } else {
        throw new Error(response.data.msg || 'Failed to get devices');
      }
    } catch (error: any) {
      console.error('Error getting devices from HikCentral:', error);
      throw error;
    }
  }
}

export default HikCentralClient;