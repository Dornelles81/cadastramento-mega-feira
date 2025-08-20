import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import HikCentralPuppeteer from '../../../lib/hikcental/hikcentral-puppeteer';
import OptimusClient from '../../../lib/hikcental/optimus-client';
import HikCentralISAPI from '../../../lib/hikcental/hikcentral-isapi';
import HikCentralWebAPI from '../../../lib/hikcental/hikcentral-api';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { participantId, action, rejectionReason } = req.body;

  if (!participantId || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    // Get participant data
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Update approval status
    const updateData: any = {
      approvalStatus: action === 'approve' ? 'approved' : 'rejected',
      approvedBy: 'admin',
      approvedAt: action === 'approve' ? new Date() : null,
      rejectionReason: action === 'reject' ? rejectionReason : null
    };

    // If approved, send to HikCentral
    if (action === 'approve') {
      let syncSuccess = false;
      let syncError = null;
      let personId = null;

      // Prepare person data
      const personData = {
        name: participant.name,
        cpf: participant.cpf,
        phone: participant.phone,
        email: participant.email,
        faceImageUrl: participant.faceImageUrl
      };

      // Try multiple integration methods
      console.log('Attempting HikCentral integration...');

      // Method 1: Try Puppeteer browser automation (most reliable)
      try {
        console.log('Trying browser automation...');
        const puppeteer = new HikCentralPuppeteer();
        
        const testResult = await puppeteer.testConnection();
        if (testResult.success) {
          const result = await puppeteer.addVisitor(personData);
          personId = result.visitorId || personData.cpf.replace(/\D/g, '').substring(0, 8);
          
          await puppeteer.disconnect();
          
          syncSuccess = true;
          console.log('User added via browser automation:', result);
        }
      } catch (puppeteerError: any) {
        console.log('Browser automation failed:', puppeteerError.message);
        syncError = puppeteerError.message;
      }

      // Method 2: Try Optimus Integration if browser automation failed
      if (!syncSuccess) {
        try {
        console.log('Trying Optimus integration...');
        const optimus = new OptimusClient();
        
        const testResult = await optimus.testConnection();
        if (testResult.success) {
          const userResult = await optimus.addPerson(personData);
          personId = personData.cpf.replace(/\D/g, '').substring(0, 8);
          
          // Upload face if available
          if (personData.faceImageUrl) {
            try {
              await optimus.uploadFace(personId, personData.faceImageUrl);
            } catch (e) {
              console.log('Face upload failed:', e);
            }
          }
          
          // Sync to devices
          await optimus.syncToDevices(personId);
          
          syncSuccess = true;
          console.log('User added via Optimus:', userResult);
        }
      } catch (optimusError: any) {
        console.log('Optimus method failed:', optimusError.message);
        syncError = optimusError.message;
      }

      }

      // Method 3: Try ISAPI integration if previous methods failed
      if (!syncSuccess) {
        try {
          console.log('Trying ISAPI integration...');
          const isapi = new HikCentralISAPI();
          
          const testResult = await isapi.testConnection();
          if (testResult.success) {
            const userResult = await isapi.addUser(personData);
            personId = personData.cpf.replace(/\D/g, '').substring(0, 8);
            syncSuccess = true;
            console.log('User added via ISAPI:', userResult);
          }
        } catch (isapiError: any) {
          console.log('ISAPI method failed:', isapiError.message);
          syncError = isapiError.message;
        }
      }

      // Method 4: Try Web API integration if all previous methods failed
      if (!syncSuccess) {
        try {
          console.log('Trying Web API integration...');
          const webApi = new HikCentralWebAPI();
          
          const loginSuccess = await webApi.login('admin', 'Index2016');
          if (loginSuccess) {
            const addResult = await webApi.addPerson(personData);
            personId = addResult.personId || personData.cpf.replace(/\D/g, '').substring(0, 8);
            syncSuccess = true;
            console.log('User added via Web API:', addResult);
          }
        } catch (webError: any) {
          console.log('Web API method failed:', webError.message);
          syncError = webError.message;
        }
      }

      // Update sync status based on results
      if (syncSuccess) {
        updateData.hikCentralSyncStatus = 'synced';
        updateData.hikCentralPersonId = personId;
        updateData.hikCentralSyncedAt = new Date();
        updateData.hikCentralErrorMsg = null;
        
        console.log('✅ HikCentral sync successful for:', participant.name);
      } else {
        // Still approve but mark sync as failed
        updateData.hikCentralSyncStatus = 'failed';
        updateData.hikCentralErrorMsg = syncError || 'Failed to sync with HikCentral Professional';
        
        console.error('❌ HikCentral sync failed for:', participant.name);
        
        // Create sync log
        await prisma.hikCentralSyncLog.create({
          data: {
            participantId: participant.id,
            syncType: 'individual',
            syncStatus: 'failed',
            syncDirection: 'upload',
            errorMessage: syncError,
            startedAt: new Date(),
            completedAt: new Date()
          }
        });
      }
    }

    // Update participant
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: updateData
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entityType: 'participant',
        entityId: participantId,
        adminUser: 'admin',
        adminIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
        previousData: { approvalStatus: participant.approvalStatus },
        newData: { approvalStatus: updateData.approvalStatus },
        description: `Participant ${action}ed${action === 'reject' ? ` with reason: ${rejectionReason}` : ''}`
      }
    });

    return res.status(200).json({
      success: true,
      participant: updatedParticipant,
      hikvisionSync: updateData.hikCentralSyncStatus === 'synced' ? 'success' : 'failed'
    });

  } catch (error: any) {
    console.error('Error approving participant:', error);
    return res.status(500).json({ 
      error: 'Failed to process approval',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}