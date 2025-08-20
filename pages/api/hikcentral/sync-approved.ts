import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import HikCentralClient from '../../../lib/hikcental/hikcentral-client';

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

  try {
    // Get all approved participants not yet synced
    const participants = await prisma.participant.findMany({
      where: {
        approvalStatus: 'approved',
        OR: [
          { hikCentralSyncStatus: null },
          { hikCentralSyncStatus: 'pending' },
          { hikCentralSyncStatus: 'failed' }
        ]
      }
    });

    if (participants.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No participants to sync',
        synced: 0
      });
    }

    // Initialize HikCentral client
    const hikcentral = new HikCentralClient();
    
    // Test connection first
    try {
      await hikcentral.testConnection();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Cannot connect to HikCentral',
        details: 'Make sure HikCentral is running'
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Process each participant
    for (const participant of participants) {
      try {
        // Prepare person data
        const personData = {
          personCode: participant.cpf.replace(/\D/g, ''), // Remove non-digits from CPF
          personName: participant.name,
          gender: 0, // Unknown
          phoneNo: participant.phone,
          email: participant.email,
          certificateType: '111', // CPF type
          certificateNo: participant.cpf,
          jobNo: participant.cpf.replace(/\D/g, '').substring(0, 8)
        };

        // Check if person already exists
        const searchResult = await hikcentral.searchPerson(personData.personCode);
        
        let personId;
        if (searchResult.persons.length > 0) {
          // Update existing person
          personId = searchResult.persons[0].personId;
          personData['personId'] = personId;
          await hikcentral.updatePerson(personData);
        } else {
          // Add new person
          const addResult = await hikcentral.addPerson(personData);
          personId = addResult.personId;
        }

        // Add face if available
        if (participant.faceImageUrl && personId) {
          try {
            await hikcentral.addFace(personId, participant.faceImageUrl);
          } catch (faceError: any) {
            console.error('Failed to add face:', faceError);
            // Continue even if face fails
          }
        }

        // Get devices and assign permissions
        try {
          const devices = await hikcentral.getDevices();
          if (devices.devices.length > 0) {
            const deviceCodes = devices.devices.map(d => d.indexCode);
            await hikcentral.assignAccessPermission(personId, deviceCodes);
          }
        } catch (permError: any) {
          console.error('Failed to assign permissions:', permError);
          // Continue even if permissions fail
        }

        // Update participant sync status
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            hikCentralSyncStatus: 'synced',
            hikCentralPersonId: personId,
            hikCentralSyncedAt: new Date(),
            hikCentralErrorMsg: null
          }
        });

        // Create sync log
        await prisma.hikCentralSyncLog.create({
          data: {
            participantId: participant.id,
            syncType: 'batch',
            syncStatus: 'success',
            syncDirection: 'upload',
            httpStatus: 200,
            startedAt: new Date(),
            completedAt: new Date()
          }
        });

        results.push({
          participantId: participant.id,
          name: participant.name,
          status: 'success',
          personId: personId
        });
        
        successCount++;
        
      } catch (error: any) {
        console.error(`Failed to sync participant ${participant.id}:`, error);
        
        // Update participant with error
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            hikCentralSyncStatus: 'failed',
            hikCentralErrorMsg: error.message
          }
        });

        // Create error log
        await prisma.hikCentralSyncLog.create({
          data: {
            participantId: participant.id,
            syncType: 'batch',
            syncStatus: 'failed',
            syncDirection: 'upload',
            httpStatus: error.response?.status || 500,
            errorMessage: error.message,
            errorDetails: error.response?.data,
            startedAt: new Date(),
            completedAt: new Date()
          }
        });

        results.push({
          participantId: participant.id,
          name: participant.name,
          status: 'failed',
          error: error.message
        });
        
        failCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sync completed: ${successCount} success, ${failCount} failed`,
      total: participants.length,
      synced: successCount,
      failed: failCount,
      results: results
    });

  } catch (error: any) {
    console.error('Error syncing to HikCentral:', error);
    return res.status(500).json({ 
      error: 'Failed to sync with HikCentral',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}