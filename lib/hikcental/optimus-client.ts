// HikCentral Optimus Integration Client
// Uses Optimus API for third-party integration

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import crypto from 'crypto';

export class OptimusClient {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    // Try different possible Optimus/HikCentral API endpoints
    this.baseURL = 'https://127.0.0.1';
    this.apiKey = process.env.OPTIMUS_API_KEY || 'admin';
    this.apiSecret = process.env.OPTIMUS_API_SECRET || 'Index2016';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add authentication interceptor
    this.client.interceptors.request.use((config) => {
      // Add authentication headers
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');
      const signature = this.generateSignature(config.method!, config.url!, timestamp, nonce);
      
      config.headers['X-Api-Key'] = this.apiKey;
      config.headers['X-Timestamp'] = timestamp;
      config.headers['X-Nonce'] = nonce;
      config.headers['X-Signature'] = signature;
      
      // Also try basic auth
      config.auth = {
        username: this.apiKey,
        password: this.apiSecret
      };
      
      return config;
    });
  }

  private generateSignature(method: string, url: string, timestamp: string, nonce: string): string {
    const signString = `${method.toUpperCase()}\n${url}\n${timestamp}\n${nonce}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('hex');
  }

  // Test connection
  async testConnection(): Promise<any> {
    try {
      // Try HikCentral and Optimus endpoints
      const endpoints = [
        '/portal/api/v1/system/info',
        '/portal/openapi/v1/status',
        '/artemis/api/v1/status',
        '/openapi/v1/status',
        '/optimus/api/v1/system/info',
        '/optimus/v1/status',
        '/api/v1/system/info',
        '/v1/system/info',
        '/v1/status',
        '/system/info',
        '/info',
        '/health'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Testing endpoint: ${this.baseURL}${endpoint}`);
          const response = await this.client.get(endpoint);
          
          if (response.status === 200) {
            console.log('✅ Optimus API is accessible!');
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

      throw new Error('No HikCentral/Optimus endpoints found. The integration might not be properly configured.');
      
    } catch (error: any) {
      throw new Error(`Optimus connection failed: ${error.message}`);
    }
  }

  // Add person via Optimus API
  async addPerson(personData: any): Promise<any> {
    try {
      // Optimus person structure
      const optimusData = {
        personCode: personData.cpf?.replace(/\D/g, ''),
        personName: personData.name,
        gender: 'unknown',
        phoneNo: personData.phone,
        email: personData.email,
        departmentCode: 'MEGAFEIRA2025',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        cardNo: personData.cpf?.replace(/\D/g, '').substring(0, 8),
        userType: 'visitor',
        accessLevel: 1
      };

      // Try different person endpoints for HikCentral
      const endpoints = [
        '/portal/api/v1/visitor/add',
        '/portal/openapi/v1/person/add',
        '/artemis/api/v1/person/add',
        '/openapi/v1/person/add',
        '/optimus/api/v1/person/add',
        '/api/v1/person/add',
        '/v1/person/add',
        '/v1/persons',
        '/person/add',
        '/persons'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to add person via Optimus: ${endpoint}`);
          const response = await this.client.post(endpoint, optimusData);
          
          if (response.status === 200 || response.status === 201) {
            console.log('✅ Person added via Optimus!');
            return {
              success: true,
              data: response.data
            };
          }
        } catch (error: any) {
          console.log(`Failed at ${endpoint}: ${error.response?.status}`);
          continue;
        }
      }

      throw new Error('Failed to add person through Optimus');
      
    } catch (error: any) {
      throw new Error(`Optimus addPerson failed: ${error.message}`);
    }
  }

  // Search person
  async searchPerson(cpf: string): Promise<any> {
    try {
      const searchData = {
        personCode: cpf.replace(/\D/g, ''),
        pageNo: 1,
        pageSize: 10
      };

      const endpoints = [
        '/v1/person/search',
        '/v1/persons/search',
        '/person/search'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.client.post(endpoint, searchData);
          if (response.data) {
            return response.data;
          }
        } catch (error) {
          continue;
        }
      }

      return { persons: [] };
      
    } catch (error: any) {
      throw new Error(`Optimus search failed: ${error.message}`);
    }
  }

  // Upload face image
  async uploadFace(personCode: string, faceImage: string): Promise<any> {
    try {
      const faceData = {
        personCode: personCode,
        faceImage: faceImage.replace(/^data:image\/\w+;base64,/, ''),
        faceType: 'photo'
      };

      const endpoints = [
        '/v1/face/upload',
        '/v1/faces',
        '/face/upload'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.client.post(endpoint, faceData);
          if (response.status === 200 || response.status === 201) {
            return {
              success: true,
              data: response.data
            };
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error('Failed to upload face');
      
    } catch (error: any) {
      throw new Error(`Face upload failed: ${error.message}`);
    }
  }

  // Sync with devices
  async syncToDevices(personCode: string): Promise<any> {
    try {
      const syncData = {
        personCode: personCode,
        deviceCodes: ['all'] // Sync to all devices
      };

      const response = await this.client.post('/v1/sync/person', syncData);
      return response.data;
      
    } catch (error: any) {
      console.log('Sync to devices failed:', error.message);
      return { synced: false };
    }
  }
}

export default OptimusClient;