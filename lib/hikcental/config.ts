// HikCentral Configuration
export interface HikCentralConfig {
  baseUrl: string;
  apiVersion: string;
  auth: {
    type: 'apikey' | 'digest';
    username?: string;
    password?: string;
    apiKey?: string;
    apiSecret?: string;
  };
  endpoints: {
    personBatch: string;
    personSingle: string;
    faceUpload: string;
    cardAssign: string;
    accessLevel: string;
    eventSubscribe: string;
    personStatus: string;
    personDelete: string;
  };
  limits: {
    batchSize: number;
    maxRetries: number;
    retryDelay: number;
    requestTimeout: number;
    rateLimit: number;
  };
  faceLibrary: {
    libraryId: string;
    libraryType: string;
  };
}

// Default configuration (can be overridden from database)
export const defaultHikCentralConfig: HikCentralConfig = {
  baseUrl: process.env.HIKCENTER_URL || 'https://hikcenter.local',
  apiVersion: '/api/acs/v1',
  auth: {
    type: 'apikey',
    apiKey: process.env.HIKCENTER_API_KEY,
    apiSecret: process.env.HIKCENTER_API_SECRET,
    username: process.env.HIKCENTER_USER,
    password: process.env.HIKCENTER_PASS
  },
  endpoints: {
    personBatch: '/person/batch',
    personSingle: '/person/single',
    faceUpload: '/face/upload',
    cardAssign: '/card/assign',
    accessLevel: '/accessLevel/assign',
    eventSubscribe: '/event/subscribe',
    personStatus: '/person/status',
    personDelete: '/person/delete'
  },
  limits: {
    batchSize: 100,
    maxRetries: 3,
    retryDelay: 5000,
    requestTimeout: 30000,
    rateLimit: 10
  },
  faceLibrary: {
    libraryId: '1',
    libraryType: 'blackFD'
  }
};

// Load configuration from database or environment
export async function loadHikCentralConfig(): Promise<HikCentralConfig> {
  // This can be extended to load from database
  return defaultHikCentralConfig;
}