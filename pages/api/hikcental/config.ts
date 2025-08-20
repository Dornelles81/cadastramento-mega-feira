import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Encrypt sensitive data
function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.MASTER_KEY || 'default-key-32-characters-long!!', 'utf-8').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decrypt sensitive data
function decrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.MASTER_KEY || 'default-key-32-characters-long!!', 'utf-8').slice(0, 32);
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Validate admin authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      // Get current configuration
      const config = await prisma.hikCentralConfig.findFirst({
        where: { isActive: true }
      });

      if (!config) {
        return res.status(404).json({ error: 'No configuration found' });
      }

      // Don't send sensitive data
      const safeConfig = {
        id: config.id,
        name: config.name,
        baseUrl: config.baseUrl,
        apiVersion: config.apiVersion,
        authType: config.authType,
        username: config.username,
        libraryId: config.libraryId,
        libraryType: config.libraryType,
        batchSize: config.batchSize,
        maxRetries: config.maxRetries,
        retryDelay: config.retryDelay,
        requestTimeout: config.requestTimeout,
        rateLimit: config.rateLimit,
        defaultAccessLevel: config.defaultAccessLevel,
        validityDays: config.validityDays,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
        webhookEnabled: config.webhookEnabled,
        webhookUrl: config.webhookUrl,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      };

      return res.status(200).json({
        success: true,
        config: safeConfig
      });

    } else if (req.method === 'POST' || req.method === 'PUT') {
      // Create or update configuration
      const {
        name = 'default',
        baseUrl,
        apiVersion = '/api/acs/v1',
        authType = 'apikey',
        username,
        password,
        apiKey,
        apiSecret,
        libraryId = '1',
        libraryType = 'blackFD',
        batchSize = 100,
        maxRetries = 3,
        retryDelay = 5000,
        requestTimeout = 30000,
        rateLimit = 10,
        defaultAccessLevel = '1',
        validityDays = 90,
        autoSync = false,
        syncInterval = 300,
        webhookEnabled = false,
        webhookUrl
      } = req.body;

      // Validate required fields
      if (!baseUrl) {
        return res.status(400).json({ error: 'Base URL is required' });
      }

      if (authType === 'apikey' && (!apiKey || !apiSecret)) {
        return res.status(400).json({ 
          error: 'API Key and Secret are required for apikey auth type' 
        });
      }

      if (authType === 'digest' && (!username || !password)) {
        return res.status(400).json({ 
          error: 'Username and Password are required for digest auth type' 
        });
      }

      // Prepare data with encrypted sensitive fields
      const configData: any = {
        name,
        baseUrl,
        apiVersion,
        authType,
        username,
        libraryId,
        libraryType,
        batchSize,
        maxRetries,
        retryDelay,
        requestTimeout,
        rateLimit,
        defaultAccessLevel,
        validityDays,
        autoSync,
        syncInterval,
        webhookEnabled,
        webhookUrl
      };

      // Encrypt sensitive data
      if (password) {
        configData.password = encrypt(password);
      }
      if (apiKey) {
        configData.apiKey = encrypt(apiKey);
      }
      if (apiSecret) {
        configData.apiSecret = encrypt(apiSecret);
      }

      // Check if config exists
      const existingConfig = await prisma.hikCentralConfig.findFirst({
        where: { name }
      });

      let config;
      if (existingConfig) {
        // Update existing
        config = await prisma.hikCentralConfig.update({
          where: { id: existingConfig.id },
          data: configData
        });
      } else {
        // Create new
        config = await prisma.hikCentralConfig.create({
          data: configData
        });
      }

      // Log admin action
      await prisma.auditLog.create({
        data: {
          action: existingConfig ? 'UPDATE' : 'CREATE',
          entityType: 'hikcental_config',
          entityId: config.id,
          adminUser: 'admin',
          adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
          previousData: existingConfig as any,
          newData: config as any,
          description: `HikCentral configuration ${existingConfig ? 'updated' : 'created'}`
        }
      });

      return res.status(200).json({
        success: true,
        message: `Configuration ${existingConfig ? 'updated' : 'created'} successfully`,
        configId: config.id
      });

    } else if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Configuration ID is required' });
      }

      await prisma.hikCentralConfig.delete({
        where: { id: id as string }
      });

      // Log admin action
      await prisma.auditLog.create({
        data: {
          action: 'DELETE',
          entityType: 'hikcental_config',
          entityId: id as string,
          adminUser: 'admin',
          adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
          description: 'HikCentral configuration deleted'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Configuration deleted successfully'
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error: any) {
    console.error('HikCentral config error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}