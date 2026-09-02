import { prisma } from '../../../lib/prisma'
import { enqueueDeviceRemovalBeforeDelete } from '../../../lib/agent/device-removal'
import type { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'
import { aplicarAprovacao, atorDaSessao, MENSAGEM_FALHA } from '../../../lib/participants/approval'
import { deriveFaceStatus, isValidFace } from '../../../lib/face/status'
import { encryptDocuments, decryptDocuments } from '../../../lib/documents'


async function handler(req: NextApiRequest, res: NextApiResponse, session: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
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
          faceInterocularPx: true,
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
        faceInterocularPx: p.faceInterocularPx,
        faceStatus: deriveFaceStatus(p.faceInterocularPx),
        hasValidFace: isValidFace(p.faceInterocularPx),
        faceImageUrl: p.faceImageUrl,
        customData: p.customData,
        documents: decryptDocuments(p.documents), // decifra server-side (cliente nunca vê ciphertext)
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

      // Campos comuns. `approvalStatus` NÃO entra aqui: mudar aprovação é a
      // transição que dá acesso físico (identidade + biometria em todos os
      // terminais), e fazê-la por dentro de um update genérico foi o que
      // produzia aprovação sem fan-out e com ator 'admin' fixo. Vai abaixo,
      // pelo núcleo único.
      const updatedParticipant = await prisma.participant.update({
        where: { id },
        data: {
          name: updateData.name,
          cpf: updateData.cpf,
          email: updateData.email,
          phone: updateData.phone,
          eventCode: updateData.eventCode,
          customData: updateData.customData,
          documents: encryptDocuments(updateData.documents) // re-cifra (cliente envia em claro)
        }
      });

      // Mudança de aprovação vinda neste PUT: delega, para ganhar fan-out,
      // ator real e os dois logs — em vez de gravar o campo na mão.
      if (updateData.approvalStatus === 'approved' || updateData.approvalStatus === 'rejected') {
        const resultadoAprovacao = await aplicarAprovacao({
          participantId: id,
          acao: updateData.approvalStatus === 'approved' ? 'approve' : 'reject',
          ator: atorDaSessao(session),
          motivo: updateData.rejectionReason ?? null,
          ip: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null
        });
        // A recusa PRECISA sair daqui. Este PUT edita vários campos de uma vez;
        // engolir o resultado devolveria 200 com o resto salvo e o operador
        // acreditando que aprovou. Os outros campos já foram gravados acima —
        // o 422 diz exatamente o que NÃO passou.
        if (resultadoAprovacao && !resultadoAprovacao.ok) {
          return res.status(422).json({
            success: false,
            error: MENSAGEM_FALHA[resultadoAprovacao.falha],
            falha: resultadoAprovacao.falha,
            message: 'Os demais campos foram salvos; a aprovação não foi aplicada.'
          });
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          entityType: 'participant',
          entityId: id,
          adminUser: atorDaSessao(session).email,
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

      // LGPD — ORDEM CRÍTICA: enfileirar a remoção no device ANTES do delete.
      // ParticipantTerminalSync tem onDelete: Cascade; apagar o participante
      // primeiro destrói a linha que serviria para tirar a face do terminal, e
      // a biometria ficaria na catraca depois de confirmada a exclusão.
      try {
        await enqueueDeviceRemovalBeforeDelete(id);
      } catch (removalErr) {
        // Sem garantia de limpeza do device, ABORTA: melhor repetir a exclusão
        // do que apagar o registro e perder o rastro de quem remover.
        console.error('Falha ao enfileirar remoção no device; delete abortado:', removalErr);
        return res.status(503).json({
          success: false,
          message: 'Não foi possível agendar a remoção da biometria nos terminais. Exclusão cancelada — tente novamente.'
        });
      }

      // Delete participant
      await prisma.participant.delete({
        where: { id }
      });

      // LGPD: previousData SEM o biométrico. Antes gravava o participante
      // INTEIRO, então faceData/documents cifrados sobreviviam ao "delete"
      // dentro de audit_logs — uma cópia da biometria da pessoa que pediu
      // exclusão. Mesma correção que fc40fb9 aplicou ao endpoint /[id].
      const auditSnapshot: any = { ...participantToDelete };
      delete auditSnapshot.faceData;
      delete auditSnapshot.faceImageUrl;
      delete auditSnapshot.documents;

      // Create audit log
      await prisma.auditLog.create({
        data: {
          action: 'DELETE',
          entityType: 'participant',
          entityId: id,
          adminUser: atorDaSessao(session).email,
          adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '',
          previousData: auditSnapshot,
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

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Ação inválida' });
      }

      // ATENÇÃO — este caminho gravava `approvalStatus` DIRETO, sem disparar o
      // fan-out. Quem fosse aprovado por aqui ficaria aprovado e SEM
      // `employeeNo`, sem linha de sync, invisível nos terminais — e a
      // reconciliação não socorre, porque filtra `employeeNo NOT NULL`. Não
      // houve vítima (verificado em 2026-09-01: 135 aprovados, zero sem
      // identidade), porque a UI usa `participant-approval`. Mas o endpoint é
      // autenticado e estava a um POST de distância.
      //
      // Passar pelo núcleo único conserta os dois defeitos de uma vez: o fan-out
      // acontece, e o ator vai registrado no lugar do 'admin' fixo.
      const resultado = await aplicarAprovacao({
        participantId,
        acao: action as 'approve' | 'reject',
        ator: atorDaSessao(session),
        motivo: action === 'reject' ? (reason || 'Rejeitado pelo administrador') : null,
        ip: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null
      });
      if (!resultado) {
        return res.status(404).json({ success: false, message: 'Participante não encontrado' });
      }
      if (!resultado.ok) {
        // Recusa por regra (ex.: sem biometria): nada foi gravado.
        return res.status(422).json({
          success: false,
          error: MENSAGEM_FALHA[resultado.falha],
          falha: resultado.falha
        });
      }

      const updatedParticipant = await prisma.participant.findUnique({
        where: { id: participantId }
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
  }
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })