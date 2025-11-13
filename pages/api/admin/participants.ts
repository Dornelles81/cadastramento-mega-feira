import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check admin authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      // Get all participants with optional filtering and pagination
      const { search, event, approvalStatus, page = '1', limit = '50' } = req.query;

      // Parse pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100); // Max 100 por página
      const skip = (pageNum - 1) * limitNum;

      let where: any = {};

      // Filter by search term (name or CPF)
      if (search && typeof search === 'string') {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search } }
        ];
      }

      // Filter by event
      if (event && typeof event === 'string') {
        where.eventCode = event;
      }

      // Filter by approval status
      if (approvalStatus && typeof approvalStatus === 'string') {
        where.approvalStatus = approvalStatus;
      }

      // Buscar total de registros (para pagination)
      const total = await prisma.participant.count({ where });

      // Buscar participantes com select específico (otimizado)
      const participants = await prisma.participant.findMany({
        where,
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          phone: true,
          eventCode: true,
          standId: true,
          consentAccepted: true,
          captureQuality: true,
          faceImageUrl: true,
          // Não buscar faceData (binário pesado)
          customData: true,
          documents: true,
          approvalStatus: true,
          approvedAt: true,
          approvedBy: true,
          rejectionReason: true,
          hikCentralSyncStatus: true,
          hikCentralPersonId: true,
          hikCentralSyncedAt: true,
          hikCentralErrorMsg: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limitNum
      });

      // Format participants for response
      const formattedParticipants = participants.map(p => ({
        id: p.id,
        name: p.name,
        cpf: p.cpf,
        email: p.email,
        phone: p.phone,
        eventCode: p.eventCode,
        standId: p.standId,
        consentAccepted: p.consentAccepted,
        captureQuality: p.captureQuality,
        hasValidFace: !!p.faceImageUrl,
        faceImageUrl: p.faceImageUrl,
        customData: p.customData,
        documents: p.documents,
        approvalStatus: p.approvalStatus,
        approvedAt: p.approvedAt,
        approvedBy: p.approvedBy,
        rejectionReason: p.rejectionReason,
        hikCentralSyncStatus: p.hikCentralSyncStatus,
        hikCentralPersonId: p.hikCentralPersonId,
        hikCentralSyncedAt: p.hikCentralSyncedAt,
        hikCentralErrorMsg: p.hikCentralErrorMsg,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }));

      res.status(200).json({
        success: true,
        participants: formattedParticipants,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + limitNum < total
      });
    }

    else if (req.method === 'PUT') {
      // Update participant
      const { id } = req.query;
      const updateData = req.body;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'ID do participante é obrigatório'
        });
      }

      // Update participant in database
      const updatedParticipant = await prisma.participant.update({
        where: { id },
        data: {
          name: updateData.name,
          cpf: updateData.cpf,
          email: updateData.email,
          phone: updateData.phone,
          eventCode: updateData.eventCode,
          approvalStatus: updateData.approvalStatus,
          approvedBy: updateData.approvalStatus === 'approved' ? 'admin' : undefined,
          approvedAt: updateData.approvalStatus === 'approved' ? new Date() : undefined,
          rejectionReason: updateData.rejectionReason,
          customData: updateData.customData,
          documents: updateData.documents
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          entityType: 'participant',
          entityId: id,
          adminUser: 'admin',
          adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '',
          newData: updateData,
          description: `Participante ${updatedParticipant.name} atualizado`
        }
      });

      console.log(`✅ Participant updated:`, updatedParticipant.id);

      res.status(200).json({
        success: true,
        participant: updatedParticipant,
        message: 'Participante atualizado com sucesso'
      });
    }

    else if (req.method === 'DELETE') {
      // Delete participant
      const { id } = req.query;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'ID do participante é obrigatório'
        });
      }

      // Get participant data before deletion for audit
      const participantToDelete = await prisma.participant.findUnique({
        where: { id }
      });

      if (!participantToDelete) {
        return res.status(404).json({
          success: false,
          message: 'Participante não encontrado'
        });
      }

      // Delete participant
      await prisma.participant.delete({
        where: { id }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          action: 'DELETE',
          entityType: 'participant',
          entityId: id,
          adminUser: 'admin',
          adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '',
          previousData: participantToDelete as any,
          description: `Participante ${participantToDelete.name} excluído`
        }
      });
      
      console.log(`❌ Participant deleted:`, id);

      res.status(200).json({
        success: true,
        message: 'Participante excluído com sucesso'
      });
    }

    else if (req.method === 'POST') {
      // Approve or reject participant
      const { participantId, action, reason } = req.body;

      if (!participantId || !action) {
        return res.status(400).json({
          success: false,
          message: 'ID do participante e ação são obrigatórios'
        });
      }

      const updateData: any = {};
      
      if (action === 'approve') {
        updateData.approvalStatus = 'approved';
        updateData.approvedAt = new Date();
        updateData.approvedBy = 'admin';
        updateData.rejectionReason = null;
      } else if (action === 'reject') {
        updateData.approvalStatus = 'rejected';
        updateData.rejectionReason = reason || 'Rejeitado pelo administrador';
        updateData.approvedAt = null;
        updateData.approvedBy = null;
      }

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
          adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '',
          newData: updateData,
          description: `Participante ${updatedParticipant.name} ${action === 'approve' ? 'aprovado' : 'rejeitado'}`
        }
      });

      res.status(200).json({
        success: true,
        participant: updatedParticipant,
        message: `Participante ${action === 'approve' ? 'aprovado' : 'rejeitado'} com sucesso`
      });
    }

    else {
      res.status(405).json({
        success: false,
        message: 'Método não permitido'
      });
    }
  } catch (error: any) {
    console.error('Admin API error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}