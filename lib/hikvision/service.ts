// Hikvision Service - Integration with Mega Feira System

import { PrismaClient } from '@prisma/client';
import HikvisionClient from './client';

const prisma = new PrismaClient();

export class HikvisionService {
  private client: HikvisionClient;

  constructor() {
    this.client = new HikvisionClient();
  }

  // Sync a single participant to Hikvision
  async syncParticipant(participantId: string) {
    try {
      // Get participant from database
      const participant = await prisma.participant.findUnique({
        where: { id: participantId }
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      // Generate employee number (using last 8 digits of ID or CPF)
      const employeeNo = participant.cpf.replace(/\D/g, '').slice(-8) || 
                        participantId.slice(-8);

      // Add user to Hikvision device
      const userResult = await this.client.addUser({
        employeeNo,
        name: participant.name,
        userType: 'normal',
        valid: {
          enable: true,
          beginTime: new Date().toISOString().split('T')[0] + 'T00:00:00',
          endTime: '2037-12-31T23:59:59'
        }
      });

      console.log('User added to Hikvision:', userResult);

      // Upload face if available
      if (participant.faceImage) {
        const faceResult = await this.client.uploadFace(
          employeeNo,
          participant.faceImage
        );
        console.log('Face uploaded to Hikvision:', faceResult);
      }

      // Update sync status in database
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          syncStatus: 'synced',
          syncedAt: new Date(),
          externalId: employeeNo
        }
      });

      return {
        success: true,
        employeeNo,
        message: 'Participant synced successfully'
      };

    } catch (error) {
      console.error('Error syncing participant:', error);
      
      // Update sync status as failed
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          syncStatus: 'failed',
          syncError: error.message
        }
      });

      throw error;
    }
  }

  // Sync multiple participants
  async syncBatch(participantIds: string[]) {
    const results = [];
    
    for (const id of participantIds) {
      try {
        const result = await this.syncParticipant(id);
        results.push({ id, ...result });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // Sync all pending participants
  async syncPendingParticipants() {
    try {
      // Get all participants not synced
      const pending = await prisma.participant.findMany({
        where: {
          OR: [
            { syncStatus: null },
            { syncStatus: 'pending' },
            { syncStatus: 'failed' }
          ]
        },
        take: 30 // Hikvision max batch size
      });

      if (pending.length === 0) {
        return {
          success: true,
          message: 'No pending participants to sync',
          synced: 0
        };
      }

      const ids = pending.map(p => p.id);
      const results = await this.syncBatch(ids);

      const successCount = results.filter(r => r.success).length;

      return {
        success: true,
        message: `Synced ${successCount} of ${pending.length} participants`,
        synced: successCount,
        failed: pending.length - successCount,
        results
      };

    } catch (error) {
      console.error('Error syncing pending participants:', error);
      throw error;
    }
  }

  // Remove participant from Hikvision
  async removeParticipant(participantId: string) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id: participantId }
      });

      if (!participant || !participant.externalId) {
        throw new Error('Participant not found or not synced');
      }

      // Delete from Hikvision
      await this.client.deleteUser(participant.externalId);

      // Update database
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          syncStatus: 'removed',
          externalId: null
        }
      });

      return {
        success: true,
        message: 'Participant removed from Hikvision'
      };

    } catch (error) {
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus() {
    try {
      // Get device info
      const deviceInfo = await this.client.getDeviceInfo();
      
      // Get user count on device
      const userCount = await this.client.getUserCount();
      
      // Get database stats
      const dbStats = await prisma.participant.groupBy({
        by: ['syncStatus'],
        _count: true
      });

      const stats = {
        synced: 0,
        pending: 0,
        failed: 0,
        total: 0
      };

      dbStats.forEach(stat => {
        if (stat.syncStatus === 'synced') stats.synced = stat._count;
        else if (stat.syncStatus === 'pending') stats.pending = stat._count;
        else if (stat.syncStatus === 'failed') stats.failed = stat._count;
        stats.total += stat._count;
      });

      return {
        device: {
          model: deviceInfo.DeviceInfo?.model,
          serialNumber: deviceInfo.DeviceInfo?.serialNumber,
          firmwareVersion: deviceInfo.DeviceInfo?.firmwareVersion,
          connected: true,
          usersOnDevice: userCount.UserInfoCount?.userNumber || 0
        },
        database: stats,
        lastSync: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        device: {
          connected: false,
          error: error.message
        },
        database: {
          synced: 0,
          pending: 0,
          failed: 0,
          total: 0
        }
      };
    }
  }

  // Get access logs from device
  async getAccessLogs(hours: number = 24) {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();
      
      const logs = await this.client.getAccessLogs(startTime, endTime);
      
      return {
        success: true,
        logs: logs.AcsEvent?.InfoList || [],
        period: {
          start: startTime,
          end: endTime
        }
      };
    } catch (error) {
      console.error('Error getting access logs:', error);
      throw error;
    }
  }
}

export default HikvisionService;