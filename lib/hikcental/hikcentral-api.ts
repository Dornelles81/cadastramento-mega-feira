// HikCentral Professional Web API Client
// Direct integration with HikCentral Professional web interface

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import crypto from 'crypto';

export class HikCentralWebAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private sessionCookie: string | null = null;
  private csrfToken: string | null = null;

  constructor() {
    this.baseURL = 'https://127.0.0.1';
    
    // Create axios instance with self-signed certificate support
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      }),
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
  }

  // Login to HikCentral web interface
  async login(username: string = 'admin', password: string = 'Index2016'): Promise<boolean> {
    try {
      console.log('Attempting to login to HikCentral...');
      
      // Try different login endpoints
      const loginEndpoints = [
        '/portal/login',
        '/login',
        '/api/login',
        '/auth/login',
        '/api/auth/login'
      ];

      for (const endpoint of loginEndpoints) {
        try {
          console.log(`Trying login endpoint: ${endpoint}`);
          
          const response = await this.client.post(endpoint, {
            username: username,
            password: password,
            // May need additional fields
            rememberMe: false,
            captcha: ''
          });

          // Check for session cookie
          const setCookieHeader = response.headers['set-cookie'];
          if (setCookieHeader) {
            this.sessionCookie = setCookieHeader[0];
            console.log('Login successful, session established');
            
            // Update default headers with session
            this.client.defaults.headers.common['Cookie'] = this.sessionCookie;
            
            // Try to get CSRF token if needed
            await this.getCsrfToken();
            
            return true;
          }

          // Check if login was successful based on response
          if (response.data.success || response.data.code === 0 || response.status === 200) {
            console.log('Login successful via API');
            return true;
          }
        } catch (error) {
          console.log(`Login failed for endpoint ${endpoint}`);
          continue;
        }
      }

      console.error('All login attempts failed');
      return false;
      
    } catch (error: any) {
      console.error('Login error:', error.message);
      return false;
    }
  }

  // Get CSRF token for requests
  private async getCsrfToken() {
    try {
      const response = await this.client.get('/portal');
      
      // Extract CSRF token from response
      const html = response.data;
      const csrfMatch = html.match(/csrf[_-]?token["']?\s*[:=]\s*["']([^"']+)["']/i);
      
      if (csrfMatch) {
        this.csrfToken = csrfMatch[1];
        console.log('CSRF token obtained');
        
        // Add to default headers
        this.client.defaults.headers.common['X-CSRF-Token'] = this.csrfToken;
      }
    } catch (error) {
      console.log('Could not get CSRF token');
    }
  }

  // Add person/visitor through web API
  async addPerson(personData: any): Promise<any> {
    try {
      // Ensure we're logged in
      if (!this.sessionCookie) {
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('Failed to authenticate with HikCentral');
        }
      }

      // Try different API endpoints for adding persons
      const endpoints = [
        '/portal/api/person/add',
        '/portal/api/visitor/add',
        '/api/resource/v1/person/add',
        '/api/visitor/v1/add',
        '/portal/visitor/add'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to add person via: ${endpoint}`);
          
          const response = await this.client.post(endpoint, {
            name: personData.name,
            personCode: personData.cpf?.replace(/\D/g, ''),
            cardNo: personData.cpf?.replace(/\D/g, '').substring(0, 8),
            gender: 0,
            phone: personData.phone,
            email: personData.email,
            department: 'Mega Feira 2025',
            validFrom: new Date().toISOString(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            // Additional fields that might be required
            userType: 'visitor',
            accessLevel: 'default',
            ...personData
          });

          if (response.data.success || response.data.code === 0) {
            console.log('Person added successfully');
            return response.data;
          }
        } catch (error) {
          console.log(`Failed to add via ${endpoint}`);
          continue;
        }
      }

      throw new Error('Failed to add person through any endpoint');
      
    } catch (error: any) {
      console.error('Error adding person:', error);
      throw error;
    }
  }

  // Search for person
  async searchPerson(cpf: string): Promise<any> {
    try {
      if (!this.sessionCookie) {
        await this.login();
      }

      const endpoints = [
        '/portal/api/person/search',
        '/portal/api/visitor/search',
        '/api/resource/v1/person/search'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.client.post(endpoint, {
            personCode: cpf.replace(/\D/g, ''),
            pageNo: 1,
            pageSize: 10
          });

          if (response.data) {
            return response.data;
          }
        } catch (error) {
          continue;
        }
      }

      return null;
    } catch (error: any) {
      console.error('Error searching person:', error);
      throw error;
    }
  }

  // Get current session info
  async getSessionInfo(): Promise<any> {
    try {
      const response = await this.client.get('/portal/api/session/info');
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      // Try to access the portal page
      const response = await this.client.get('/portal');
      
      // If we get redirected to login, we know the server is up
      if (response.status === 200 || response.status === 302) {
        console.log('HikCentral Professional is accessible');
        return true;
      }
      
      return false;
    } catch (error: any) {
      // Even errors can indicate the server is running
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log('HikCentral Professional is running (auth required)');
        return true;
      }
      return false;
    }
  }
}

export default HikCentralWebAPI;