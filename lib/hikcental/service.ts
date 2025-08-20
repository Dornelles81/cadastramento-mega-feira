import { PrismaClient, Participant } from '@prisma/client';
import { HikCentralClient } from './client';
import { HikCentralConfig, loadHikCentralConfig } from './config';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface PersonData {
  employeeNo: string;
  employeeName: string;
  faceData?: string;
  faceURL?: string;
  cardNo?: string;
  phoneNo?: string;
  email?: string;
  gender?: number;
  registerTime?: string;
  validStartTime?: string;
  validEndTime?: string;
  accessLevelIds?: string[];
  customData?: any;
}

export interface SyncResult {
  success: boolean;
  participantId: string;
  hikCentralPersonId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface BatchSyncResult {
  batchId: string;
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  results: SyncResult[];
  duration: number;
}

export class HikCentralService {
  private client: HikCentralClient;
  private config: HikCentralConfig;

  constructor(config?: HikCentralConfig) {
    this.config = config || {} as HikCentralConfig;
    this.client = new HikCentralClient(this.config);
  }

  async initialize(): Promise<void> {
    // Load configuration from database or environment
    this.config = await loadHikCentralConfig();
    this.client = new HikCentralClient(this.config);
    
    // Test connection
    const connected = await this.client.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to HikCentral');
    }
  }

  // Convert participant to HikCentral person format
  private participantToPersonData(participant: Participant): PersonData {
    // Generate a unique employee number using participant ID
    const employeeNo = participant.hikCentralPersonId || 
                      participant.id.replace(/-/g, '').substring(0, 20);
    
    return {
      employeeNo,
      employeeName: participant.name,
      cardNo: participant.cpf?.replace(/\D/g, ''), // Remove non-digits
      phoneNo: participant.phone,
      email: participant.email || undefined,
      faceURL: participant.faceImageUrl || undefined,
      registerTime: new Date().toISOString(),
      validStartTime: new Date().toISOString(),
      validEndTime: this.getValidEndDate(),
      accessLevelIds: [this.config.faceLibrary.libraryId],
      customData: {
        participantId: participant.id,
        eventCode: participant.eventCode,
        consentDate: participant.consentDate
      }
    };
  }

  private getValidEndDate(): string {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90); // 90 days from now
    return endDate.toISOString();
  }

  // Sync single participant
  async syncParticipant(participantId: string): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      // Get participant data
      const participant = await prisma.participant.findUnique({
        where: { id: participantId }
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      // Check if already synced
      if (participant.hikCentralSyncStatus === 'synced' && participant.hikCentralPersonId) {
        return {
          success: true,
          participantId,
          hikCentralPersonId: participant.hikCentralPersonId
        };
      }

      // Update status to syncing
      await prisma.participant.update({
        where: { id: participantId },
        data: { hikCentralSyncStatus: 'syncing' }
      });

      // Prepare person data
      const personData = this.participantToPersonData(participant);

      // Upload to HikCentral
      const response = await this.client.post(
        this.config.endpoints.personSingle,
        {
          faceLibType: this.config.faceLibrary.libraryType,
          FDID: this.config.faceLibrary.libraryId,
          person: personData
        }
      );

      // Parse response and get person ID
      const hikCentralPersonId = response.data?.personId || personData.employeeNo;

      // Update participant with sync status
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          hikCentralSyncStatus: 'synced',
          hikCentralPersonId,
          hikCentralSyncedAt: new Date(),
          hikCentralErrorMsg: null
        }
      });

      // Log sync success
      await prisma.hikCentralSyncLog.create({
        data: {
          participantId,
          syncType: 'individual',
          syncStatus: 'success',
          hikCentralPersonId,
          requestData: personData as any,
          responseData: response as any,
          httpStatus: 200,
          duration: Date.now() - startTime,
          completedAt: new Date()
        }
      });

      return {
        success: true,
        participantId,
        hikCentralPersonId
      };

    } catch (error: any) {
      // Update participant with error
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          hikCentralSyncStatus: 'failed',
          hikCentralErrorMsg: error.message
        }
      });

      // Log sync failure
      await prisma.hikCentralSyncLog.create({
        data: {
          participantId,
          syncType: 'individual',
          syncStatus: 'failed',
          errorMessage: error.message,
          errorDetails: error.response?.data as any,
          httpStatus: error.response?.status,
          duration: Date.now() - startTime,
          completedAt: new Date()
        }
      });

      return {
        success: false,
        participantId,
        errorMessage: error.message,
        errorCode: error.response?.data?.errorCode
      };
    }
  }

  // Sync batch of participants
  async syncBatch(participantIds: string[]): Promise<BatchSyncResult> {
    const startTime = Date.now();
    const batchNumber = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Create batch record
    const batch = await prisma.hikCentralSyncBatch.create({
      data: {
        batchNumber,
        syncType: 'manual',
        syncStatus: 'processing',
        totalParticipants: participantIds.length,
        startedAt: new Date()
      }
    });

    const results: SyncResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Process in chunks
    const chunks = this.createChunks(participantIds, this.config.limits.batchSize);

    for (const chunk of chunks) {
      try {
        // Get participants data
        const participants = await prisma.participant.findMany({
          where: { id: { in: chunk } }
        });

        // Prepare batch data
        const personsData = participants.map(p => this.participantToPersonData(p));

        // Upload batch to HikCentral
        const response = await this.client.post(
          this.config.endpoints.personBatch,
          {
            faceLibType: this.config.faceLibrary.libraryType,
            FDID: this.config.faceLibrary.libraryId,
            employeeList: personsData
          }
        );

        // Process response
        const batchResults = response.data?.results || [];
        
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          const result = batchResults[i];
          
          if (result?.success) {
            // Update participant as synced
            await prisma.participant.update({
              where: { id: participant.id },
              data: {
                hikCentralSyncStatus: 'synced',
                hikCentralPersonId: result.personId || personsData[i].employeeNo,
                hikCentralSyncedAt: new Date(),
                hikCentralErrorMsg: null
              }
            });

            results.push({
              success: true,
              participantId: participant.id,
              hikCentralPersonId: result.personId
            });
            successCount++;
          } else {
            // Update participant as failed
            await prisma.participant.update({
              where: { id: participant.id },
              data: {
                hikCentralSyncStatus: 'failed',
                hikCentralErrorMsg: result?.errorMessage || 'Unknown error'
              }
            });

            results.push({
              success: false,
              participantId: participant.id,
              errorMessage: result?.errorMessage,
              errorCode: result?.errorCode
            });
            failedCount++;
          }

          // Log individual sync
          await prisma.hikCentralSyncLog.create({
            data: {
              participantId: participant.id,
              syncType: 'batch',
              syncStatus: result?.success ? 'success' : 'failed',
              batchId: batch.id,
              batchPosition: i,
              hikCentralPersonId: result?.personId,
              requestData: personsData[i] as any,
              responseData: result as any,
              errorMessage: result?.errorMessage,
              errorCode: result?.errorCode,
              duration: Date.now() - startTime,
              completedAt: new Date()
            }
          });
        }
      } catch (error: any) {
        // Handle batch error
        for (const participantId of chunk) {
          results.push({
            success: false,
            participantId,
            errorMessage: error.message,
            errorCode: 'BATCH_ERROR'
          });
          failedCount++;
        }
      }
    }

    // Update batch record
    const duration = Date.now() - startTime;
    await prisma.hikCentralSyncBatch.update({
      where: { id: batch.id },
      data: {
        syncStatus: failedCount === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'partial'),
        successCount,
        failedCount,
        completedAt: new Date(),
        duration
      }
    });

    return {
      batchId: batch.id,
      totalProcessed: participantIds.length,
      successCount,
      failedCount,
      results,
      duration
    };
  }

  // Sync all pending participants
  async syncPendingParticipants(): Promise<BatchSyncResult> {
    const pendingParticipants = await prisma.participant.findMany({
      where: {
        OR: [
          { hikCentralSyncStatus: 'pending' },
          { hikCentralSyncStatus: 'failed' },
          { hikCentralSyncStatus: null }
        ]
      },
      select: { id: true }
    });

    const participantIds = pendingParticipants.map(p => p.id);
    
    if (participantIds.length === 0) {
      return {
        batchId: '',
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
        duration: 0
      };
    }

    return this.syncBatch(participantIds);
  }

  // Delete participant from HikCentral
  async deleteParticipant(participantId: string): Promise<boolean> {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id: participantId }
      });

      if (!participant || !participant.hikCentralPersonId) {
        return false;
      }

      await this.client.delete(
        `${this.config.endpoints.personDelete}/${participant.hikCentralPersonId}`
      );

      // Update participant
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          hikCentralSyncStatus: null,
          hikCentralPersonId: null,
          hikCentralSyncedAt: null
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to delete participant from HikCentral:', error);
      return false;
    }
  }

  // Get sync status for participant
  async getParticipantSyncStatus(participantId: string): Promise<any> {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: {
        hikCentralSyncStatus: true,
        hikCentralPersonId: true,
        hikCentralSyncedAt: true,
        hikCentralErrorMsg: true
      }
    });

    const lastSync = await prisma.hikCentralSyncLog.findFirst({
      where: { participantId },
      orderBy: { createdAt: 'desc' }
    });

    return {
      ...participant,
      lastSync
    };
  }

  // Utility method to create chunks
  private createChunks<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Handle webhook events from HikCentral
  async handleWebhook(eventType: string, eventData: any, headers: any): Promise<void> {
    // Log webhook
    const webhookLog = await prisma.hikCentralWebhookLog.create({
      data: {
        eventType,
        eventData,
        headers,
        sourceIp: headers['x-forwarded-for'] || headers['x-real-ip']
      }
    });

    try {
      // Process based on event type
      switch (eventType) {
        case 'FaceRecognitionEvent':
          await this.handleFaceRecognitionEvent(eventData);
          break;
        case 'AccessControllerEvent':
          await this.handleAccessEvent(eventData);
          break;
        default:
          console.log(`Unhandled webhook event type: ${eventType}`);
      }

      // Update webhook as processed
      await prisma.hikCentralWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processStatus: 'processed',
          processedAt: new Date()
        }
      });
    } catch (error: any) {
      // Update webhook with error
      await prisma.hikCentralWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processStatus: 'failed',
          processingError: error.message
        }
      });
    }
  }

  private async handleFaceRecognitionEvent(eventData: any): Promise<void> {
    // Implement face recognition event handling
    console.log('Face recognition event:', eventData);
  }

  private async handleAccessEvent(eventData: any): Promise<void> {
    // Implement access event handling
    console.log('Access event:', eventData);
  }
}