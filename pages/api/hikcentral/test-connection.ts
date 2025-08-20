import { NextApiRequest, NextApiResponse } from 'next';
import HikCentralClient from '../../../lib/hikcental/hikcentral-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Testing HikCentral connection...');
    
    // Try HTTPS first (HikCentral Professional default)
    const configs = [
      { host: '127.0.0.1', port: 443, useHttps: true },  // Default HTTPS
      { host: 'localhost', port: 443, useHttps: true },
      { host: '127.0.0.1', port: 80, useHttps: false },  // HTTP fallback
      { host: 'localhost', port: 8080, useHttps: false }
    ];
    let connected = false;
    let connectionResult = null;
    
    for (const config of configs) {
      try {
        console.log(`Trying ${config.useHttps ? 'HTTPS' : 'HTTP'} on ${config.host}:${config.port}...`);
        const client = new HikCentralClient({
          host: config.host,
          port: config.port,
          useHttps: config.useHttps,
          appKey: 'admin',
          appSecret: 'Index2016'
        });
        
        connectionResult = await client.testConnection();
        connected = true;
        
        console.log(`Connected via ${config.useHttps ? 'HTTPS' : 'HTTP'} on ${config.host}:${config.port}!`);
        
        return res.status(200).json({
          success: true,
          message: 'HikCentral Professional connection successful',
          protocol: config.useHttps ? 'HTTPS' : 'HTTP',
          host: config.host,
          port: config.port,
          data: connectionResult,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.log(`${config.host}:${config.port} failed`);
        continue;
      }
    }
    
    // If no connection was successful
    return res.status(500).json({
      success: false,
      error: 'Could not connect to HikCentral Professional',
      triedConfigs: configs.map(c => `${c.useHttps ? 'HTTPS' : 'HTTP'}://${c.host}:${c.port}`),
      message: 'Make sure HikCentral Professional is running on https://127.0.0.1',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('HikCentral connection test failed:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to HikCentral',
      details: error.response?.data || null,
      timestamp: new Date().toISOString()
    });
  }
}