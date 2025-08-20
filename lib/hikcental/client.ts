import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import crypto from 'crypto';
import { HikCentralConfig } from './config';

export class HikCentralClient {
  private client: AxiosInstance;
  private config: HikCentralConfig;
  private requestQueue: Promise<any> = Promise.resolve();
  private requestInterval: number;

  constructor(config: HikCentralConfig) {
    this.config = config;
    this.requestInterval = 1000 / config.limits.rateLimit; // Convert to milliseconds between requests
    
    this.client = axios.create({
      baseURL: config.baseUrl + config.apiVersion,
      timeout: config.limits.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => this.addAuthentication(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for retry logic
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  private addAuthentication(config: AxiosRequestConfig): AxiosRequestConfig {
    if (this.config.auth.type === 'digest') {
      // Implement Digest Authentication
      const ha1 = crypto.createHash('md5')
        .update(`${this.config.auth.username}:HikCentral:${this.config.auth.password}`)
        .digest('hex');
      
      const ha2 = crypto.createHash('md5')
        .update(`${config.method?.toUpperCase()}:${config.url}`)
        .digest('hex');
      
      const nonce = crypto.randomBytes(16).toString('hex');
      const response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${ha2}`)
        .digest('hex');
      
      if (config.headers) {
        config.headers['Authorization'] = `Digest username="${this.config.auth.username}", nonce="${nonce}", response="${response}"`;
      }
    } else {
      // API Key authentication with HMAC-SHA256 signature
      const timestamp = Date.now().toString();
      const signature = this.generateSignature(
        config.method?.toUpperCase() || 'GET',
        config.url || '',
        timestamp,
        JSON.stringify(config.data || {})
      );
      
      if (config.headers) {
        config.headers['X-API-Key'] = this.config.auth.apiKey;
        config.headers['X-Timestamp'] = timestamp;
        config.headers['X-Signature'] = signature;
      }
    }
    
    return config;
  }

  private generateSignature(method: string, url: string, timestamp: string, body: string): string {
    const message = `${method}\n${url}\n${timestamp}\n${body}`;
    return crypto
      .createHmac('sha256', this.config.auth.apiSecret || '')
      .update(message)
      .digest('base64');
  }

  private async handleError(error: AxiosError): Promise<any> {
    const config: any = error.config;
    
    if (!config || !config.retryCount) {
      config.retryCount = 0;
    }
    
    // Check if we should retry
    if (
      config.retryCount < this.config.limits.maxRetries &&
      this.isRetryableError(error)
    ) {
      config.retryCount++;
      
      console.log(`Retry attempt ${config.retryCount} for ${config.url}`);
      
      // Exponential backoff
      const delay = this.config.limits.retryDelay * Math.pow(2, config.retryCount - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.client(config);
    }
    
    console.error('Max retries exceeded or non-retryable error', error.message);
    return Promise.reject(error);
  }

  private isRetryableError(error: AxiosError): boolean {
    // Retry on network errors or 5xx status codes
    if (!error.response) {
      return true; // Network error
    }
    
    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limit
  }

  // Rate-limited request method
  private async rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          // Wait before allowing next request
          await new Promise(r => setTimeout(r, this.requestInterval));
        }
      });
    });
  }

  // Public API methods
  async post<T = any>(url: string, data?: any): Promise<T> {
    return this.rateLimitedRequest(() => 
      this.client.post<T>(url, data).then(res => res.data)
    );
  }

  async get<T = any>(url: string, params?: any): Promise<T> {
    return this.rateLimitedRequest(() => 
      this.client.get<T>(url, { params }).then(res => res.data)
    );
  }

  async put<T = any>(url: string, data?: any): Promise<T> {
    return this.rateLimitedRequest(() => 
      this.client.put<T>(url, data).then(res => res.data)
    );
  }

  async delete<T = any>(url: string): Promise<T> {
    return this.rateLimitedRequest(() => 
      this.client.delete<T>(url).then(res => res.data)
    );
  }

  // Utility method to check connection
  async testConnection(): Promise<boolean> {
    try {
      await this.get('/system/status');
      return true;
    } catch (error) {
      console.error('HikCentral connection test failed:', error);
      return false;
    }
  }
}