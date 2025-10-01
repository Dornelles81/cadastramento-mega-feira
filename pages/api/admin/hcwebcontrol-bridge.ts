import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// API Bridge para comunicação com HCWebControl
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Enable CORS for HCWebControl page
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || !authHeader.includes(validPassword)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'getParticipants':
        // Buscar participantes aprovados
        const participants = await prisma.participant.findMany({
          where: {
            approvalStatus: 'approved'
          },
          select: {
            id: true,
            name: true,
            cpf: true,
            email: true,
            phone: true,
            faceImageUrl: true,
            faceData: true,
            hikCentralSyncStatus: true,
            hikCentralPersonId: true,
            customData: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        // Converter faceData para base64 se necessário
        const formattedParticipants = participants.map(p => ({
          ...p,
          faceImage: p.faceData ? 
            `data:image/jpeg;base64,${p.faceData.toString('base64')}` : 
            p.faceImageUrl,
          faceData: undefined // Remove campo binário
        }));

        res.status(200).json({
          success: true,
          participants: formattedParticipants
        });
        return;

      case 'updateSyncStatus':
        // Atualizar status de sincronização
        const { participantId, status, hikCentralId, errorMsg } = req.body;

        const updateData: any = {
          hikCentralSyncStatus: status
        };

        if (status === 'synced' && hikCentralId) {
          updateData.hikCentralPersonId = hikCentralId;
          updateData.hikCentralSyncedAt = new Date();
        } else if (status === 'failed' && errorMsg) {
          updateData.hikCentralErrorMsg = errorMsg;
        }

        await prisma.participant.update({
          where: { id: participantId },
          data: updateData
        });

        // Criar log
        await prisma.hikCentralSyncLog.create({
          data: {
            participantId,
            syncType: 'hcwebcontrol',
            syncStatus: status === 'synced' ? 'success' : 'failed',
            hikCentralPersonId: hikCentralId,
            errorMessage: errorMsg,
            completedAt: new Date()
          }
        });

        res.status(200).json({
          success: true,
          message: 'Status atualizado'
        });
        return;

      case 'preparePersonData':
        // Preparar dados da pessoa para HikCentral
        const { participantId: pId } = req.body;
        
        const participant = await prisma.participant.findUnique({
          where: { id: pId }
        });

        if (!participant) {
          res.status(404).json({ error: 'Participante não encontrado' });
          return;
        }

        // Formatar dados para HikCentral
        const personData = {
          employeeNo: participant.cpf.replace(/\D/g, ''),
          name: participant.name,
          userType: 'normal',
          gender: 'unknown',
          email: participant.email || '',
          phone: participant.phone || '',
          Valid: {
            enable: true,
            beginTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          },
          doorRight: '1',
          RightPlan: [{
            doorNo: 1,
            planTemplateNo: '1'
          }],
          customData: participant.customData
        };

        // Adicionar imagem facial se disponível
        if (participant.faceData || participant.faceImageUrl) {
          let imageBase64 = '';
          
          if (participant.faceData) {
            imageBase64 = participant.faceData.toString('base64');
          } else if (participant.faceImageUrl) {
            // Se for data URL, extrair base64
            if (participant.faceImageUrl.startsWith('data:image')) {
              imageBase64 = participant.faceImageUrl.split(',')[1];
            }
          }

          if (imageBase64) {
            personData['faceData'] = {
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

        res.status(200).json({
          success: true,
          personData
        });
        return;

      case 'batchSync':
        // Sincronização em lote
        const { participantIds } = req.body;
        
        const batchParticipants = await prisma.participant.findMany({
          where: {
            id: { in: participantIds },
            approvalStatus: 'approved'
          }
        });

        const batchData = batchParticipants.map(p => ({
          id: p.id,
          employeeNo: p.cpf.replace(/\D/g, ''),
          name: p.name,
          email: p.email,
          phone: p.phone,
          faceImage: p.faceData ? 
            `data:image/jpeg;base64,${p.faceData.toString('base64')}` : 
            p.faceImageUrl
        }));

        res.status(200).json({
          success: true,
          participants: batchData
        });
        return;

      case 'getSyncStats':
        // Estatísticas de sincronização
        const total = await prisma.participant.count({
          where: { approvalStatus: 'approved' }
        });
        
        const synced = await prisma.participant.count({
          where: { 
            approvalStatus: 'approved',
            hikCentralSyncStatus: 'synced'
          }
        });
        
        const failed = await prisma.participant.count({
          where: { 
            approvalStatus: 'approved',
            hikCentralSyncStatus: 'failed'
          }
        });
        
        const pending = await prisma.participant.count({
          where: { 
            approvalStatus: 'approved',
            hikCentralSyncStatus: { in: ['pending', null] }
          }
        });

        res.status(200).json({
          success: true,
          stats: {
            total,
            synced,
            failed,
            pending
          }
        });
        return;

      default:
        res.status(400).json({
          error: 'Ação inválida',
          availableActions: [
            'getParticipants',
            'updateSyncStatus',
            'preparePersonData',
            'batchSync',
            'getSyncStats'
          ]
        });
        return;
    }

  } catch (error: any) {
    console.error('HCWebControl Bridge Error:', error);
    res.status(500).json({
      error: 'Erro interno',
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