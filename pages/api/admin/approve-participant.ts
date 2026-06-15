import { NextApiRequest, NextApiResponse } from 'next';
import EvolutionClient, { formatApprovalMessage } from '../../../lib/whatsapp/evolution-client';
import { prisma } from '../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Sincronização biométrica com os terminais é feita pelo agente local
    // (ParticipantTerminalSync), não mais inline aqui — ver device-integration-plan.

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

    // Send WhatsApp notification on approval
    let whatsappSent = false;
    let whatsappError = null;

    if (action === 'approve' && participant.phone) {
      try {
        console.log('Sending WhatsApp approval notification to:', participant.phone);

        // Get WhatsApp message template from config
        const textConfig = await prisma.customField.findFirst({
          where: { fieldName: '_text_whatsapp_approval' }
        });

        // Get event info for message
        let eventName = 'Mega Feira';
        let eventDate = '';
        if (participant.eventId) {
          const event = await prisma.event.findUnique({
            where: { id: participant.eventId },
            select: { name: true, startDate: true }
          });
          if (event) {
            eventName = event.name;
            eventDate = event.startDate ? new Date(event.startDate).toLocaleDateString('pt-BR') : '';
          }
        }

        const messageTemplate = textConfig?.label ||
          'Ola {nome}!\n\nSeu cadastro para o evento *{evento}* foi *APROVADO* com sucesso!\n\nVoce ja pode acessar o evento utilizando o reconhecimento facial.\n\nNos vemos la!\n\n_Equipe Mega Feira_';

        const message = formatApprovalMessage(messageTemplate, {
          name: participant.name,
          cpf: participant.cpf,
          email: participant.email || '',
          phone: participant.phone || '',
          eventName: eventName,
          eventDate: eventDate
        });

        // Send via Evolution API
        const evolutionClient = new EvolutionClient();
        const sendResult = await evolutionClient.sendTextMessage({
          phone: participant.phone,
          message: message
        });

        if (sendResult.success) {
          whatsappSent = true;
          console.log('WhatsApp notification sent successfully:', sendResult.messageId);
        } else {
          whatsappError = sendResult.error;
          console.error('WhatsApp notification failed:', sendResult.error);
        }
      } catch (whatsappErr: any) {
        whatsappError = whatsappErr.message;
        console.error('Error sending WhatsApp notification:', whatsappErr);
      }
    }

    return res.status(200).json({
      success: true,
      participant: updatedParticipant,
      hikvisionSync: 'pending',
      whatsappSent: whatsappSent,
      whatsappError: whatsappError
    });

  } catch (error: any) {
    console.error('Error approving participant:', error);
    return res.status(500).json({ 
      error: 'Failed to process approval',
      details: error.message
    });
  } finally {
  }
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })