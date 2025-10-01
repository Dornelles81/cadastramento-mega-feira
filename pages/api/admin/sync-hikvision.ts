import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

interface HikvisionUser {
  UserInfo: {
    employeeNo: string;
    name: string;
    userType: string;
    Valid: {
      enable: boolean;
      beginTime: string;
      endTime: string;
    };
    doorRight: string;
    RightPlan: Array<{
      doorNo: number;
      planTemplateNo: string;
    }>;
  };
}

interface HikvisionFaceData {
  faceLibType: string;
  FDID: string;
  FPID: string;
  faceURL: string;
  faceData: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { participantIds, syncAll } = req.body;
  
  // Configuração do dispositivo Hikvision
  const HIKVISION_URL = `http://${process.env.HIKVISION_DEVICE_IP || '192.168.1.20'}`;
  const HIKVISION_USERNAME = process.env.HIKVISION_USER || 'admin';
  const HIKVISION_PASSWORD = process.env.HIKVISION_PASSWORD || 'Index2016';

  try {
    let participants;
    
    if (syncAll) {
      participants = await prisma.participant.findMany({
        where: {
          approvalStatus: 'approved',
          hikCentralSyncStatus: { not: 'synced' }
        },
        take: 30 // Limite do dispositivo
      });
    } else if (participantIds && participantIds.length > 0) {
      participants = await prisma.participant.findMany({
        where: {
          id: { in: participantIds },
          approvalStatus: 'approved'
        }
      });
    } else {
      return res.status(400).json({ error: 'No participants specified' });
    }

    const results = [];
    const errors = [];

    for (const participant of participants) {
      try {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { hikCentralSyncStatus: 'syncing' }
        });

        // Primeiro, adicionar o usuário
        const userData: HikvisionUser = {
          UserInfo: {
            employeeNo: participant.cpf.replace(/\D/g, ''),
            name: participant.name,
            userType: 'normal',
            Valid: {
              enable: true,
              beginTime: new Date().toISOString(),
              endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            },
            doorRight: '1',
            RightPlan: [{
              doorNo: 1,
              planTemplateNo: '1'
            }]
          }
        };

        // Adicionar usuário via ISAPI
        const userResponse = await axios.post(
          `${HIKVISION_URL}/ISAPI/AccessControl/UserInfo/Record?format=json`,
          userData,
          {
            auth: {
              username: HIKVISION_USERNAME,
              password: HIKVISION_PASSWORD
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 30000
          }
        );

        // Se o usuário foi adicionado com sucesso, adicionar a foto facial
        if (userResponse.status === 200 && (participant.faceData || participant.faceImageUrl)) {
          let imageBase64 = '';
          
          if (participant.faceData) {
            imageBase64 = participant.faceData.toString('base64');
          } else if (participant.faceImageUrl) {
            try {
              // Se for URL base64
              if (participant.faceImageUrl.startsWith('data:image')) {
                imageBase64 = participant.faceImageUrl.split(',')[1];
              } else {
                // Se for URL externa
                const imageResponse = await axios.get(participant.faceImageUrl, {
                  responseType: 'arraybuffer'
                });
                imageBase64 = Buffer.from(imageResponse.data).toString('base64');
              }
            } catch (error) {
              console.error(`Failed to fetch image for ${participant.id}:`, error);
            }
          }

          if (imageBase64) {
            // Adicionar foto facial
            const faceData: HikvisionFaceData = {
              faceLibType: 'blackFD',
              FDID: '1',
              FPID: participant.cpf.replace(/\D/g, ''),
              faceURL: `/ISAPI/Intelligent/FDLib/1/picture`,
              faceData: imageBase64
            };

            const faceResponse = await axios.post(
              `${HIKVISION_URL}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`,
              faceData,
              {
                auth: {
                  username: HIKVISION_USERNAME,
                  password: HIKVISION_PASSWORD
                },
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                timeout: 30000
              }
            );

            if (faceResponse.status === 200) {
              console.log(`Face data added for ${participant.name}`);
            }
          }
        }

        // Atualizar status no banco
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            hikCentralSyncStatus: 'synced',
            hikCentralPersonId: participant.cpf.replace(/\D/g, ''),
            hikCentralSyncedAt: new Date()
          }
        });

        // Registrar no log
        await prisma.hikCentralSyncLog.create({
          data: {
            participantId: participant.id,
            syncType: 'individual',
            syncStatus: 'success',
            requestData: userData,
            responseData: userResponse.data,
            httpStatus: userResponse.status,
            hikCentralPersonId: participant.cpf.replace(/\D/g, ''),
            completedAt: new Date()
          }
        });

        results.push({
          id: participant.id,
          name: participant.name,
          status: 'success',
          hikCentralId: participant.cpf.replace(/\D/g, ''),
          message: 'Sincronizado com sucesso no dispositivo Hikvision'
        });

      } catch (error: any) {
        console.error(`Sync failed for participant ${participant.id}:`, error);
        
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            hikCentralSyncStatus: 'failed',
            hikCentralErrorMsg: error.message || 'Erro desconhecido'
          }
        });

        await prisma.hikCentralSyncLog.create({
          data: {
            participantId: participant.id,
            syncType: 'individual',
            syncStatus: 'failed',
            errorMessage: error.message,
            errorDetails: error.response?.data || error,
            httpStatus: error.response?.status,
            completedAt: new Date()
          }
        });

        errors.push({
          id: participant.id,
          name: participant.name,
          status: 'error',
          message: error.message || 'Erro ao sincronizar'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sincronização com dispositivo Hikvision concluída`,
      device: process.env.HIKVISION_DEVICE_IP || '192.168.1.20',
      totalProcessed: participants.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'Failed to sync with Hikvision device',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};