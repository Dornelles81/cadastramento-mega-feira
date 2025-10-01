import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import FormData from 'form-data';

const prisma = new PrismaClient();

interface HikCentralPerson {
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
  faceData?: {
    faceLibType: string;
    libMatching: {
      libID: string;
      FDID: string;
      FPID: string;
    };
    face: {
      binaryData: string;
    };
  };
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
  
  const HIKCENTAL_URL = process.env.HIKCENTAL_URL || 'http://localhost:80';
  const HIKCENTAL_USERNAME = process.env.HIKCENTAL_USERNAME || 'admin';
  const HIKCENTAL_PASSWORD = process.env.HIKCENTAL_PASSWORD || 'Index2016';

  try {
    let participants;
    
    if (syncAll) {
      participants = await prisma.participant.findMany({
        where: {
          approvalStatus: 'approved',
          hikCentralSyncStatus: { not: 'synced' }
        },
        take: 100
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

        const personData: HikCentralPerson = {
          employeeNo: participant.cpf.replace(/\D/g, ''),
          name: participant.name,
          userType: 'normal',
          Valid: {
            enable: true,
            beginTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          },
          doorRight: '1',
          RightPlan: [{ doorNo: 1, planTemplateNo: '1' }]
        };

        if (participant.faceData || participant.faceImageUrl) {
          let imageBase64 = '';
          
          if (participant.faceData) {
            imageBase64 = participant.faceData.toString('base64');
          } else if (participant.faceImageUrl) {
            try {
              const imageResponse = await axios.get(participant.faceImageUrl, {
                responseType: 'arraybuffer'
              });
              imageBase64 = Buffer.from(imageResponse.data).toString('base64');
            } catch (error) {
              console.error(`Failed to fetch image for ${participant.id}:`, error);
            }
          }

          if (imageBase64) {
            personData.faceData = {
              faceLibType: 'blackFD',
              libMatching: {
                libID: '1',
                FDID: '1',
                FPID: '1'
              },
              face: {
                binaryData: imageBase64
              }
            };
          }
        }

        const hikResponse = await axios.post(
          `${HIKCENTAL_URL}/api/acs/v1/person/single/add`,
          personData,
          {
            auth: {
              username: HIKCENTAL_USERNAME,
              password: HIKCENTAL_PASSWORD
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            httpsAgent: new (require('https').Agent)({
              rejectUnauthorized: false
            }),
            timeout: 30000
          }
        );

        if (hikResponse.data && hikResponse.data.code === '0') {
          const hikPersonId = hikResponse.data.data?.personId || hikResponse.data.data?.employeeNo;
          
          await prisma.participant.update({
            where: { id: participant.id },
            data: {
              hikCentralSyncStatus: 'synced',
              hikCentralPersonId: hikPersonId,
              hikCentralSyncedAt: new Date()
            }
          });

          await prisma.hikCentralSyncLog.create({
            data: {
              participantId: participant.id,
              syncType: 'individual',
              syncStatus: 'success',
              requestData: personData,
              responseData: hikResponse.data,
              httpStatus: hikResponse.status,
              hikCentralPersonId: hikPersonId,
              completedAt: new Date()
            }
          });

          results.push({
            id: participant.id,
            name: participant.name,
            status: 'success',
            hikCentralId: hikPersonId,
            message: 'Sincronizado com sucesso'
          });
        } else {
          throw new Error(hikResponse.data?.message || 'Falha na sincronização');
        }

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
      message: `Sincronização concluída`,
      totalProcessed: participants.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'Failed to sync with HikCentral',
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