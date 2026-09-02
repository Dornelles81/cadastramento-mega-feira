import { NextApiRequest, NextApiResponse } from 'next';
import EvolutionClient, { formatApprovalMessage } from '../../../lib/whatsapp/evolution-client';
import { prisma } from '../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'
import { aplicarAprovacao, atorDaSessao, MENSAGEM_FALHA } from '../../../lib/participants/approval'


async function handler(req: NextApiRequest, res: NextApiResponse, session: any) {
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

    // Estado + fan-out + logs no núcleo único (lib/participants/approval), com o
    // ator vindo da SESSÃO. Antes: `approvedBy: 'admin'` e `adminUser: 'admin'`
    // fixos — e a sessão nem era declarada no handler, embora `withApiAuth` a
    // passe como terceiro argumento desde sempre.
    const resultado = await aplicarAprovacao({
      participantId,
      acao: action,
      ator: atorDaSessao(session),
      motivo: action === 'reject' ? (rejectionReason ?? null) : null,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null
    })
    if (!resultado) {
      return res.status(404).json({ error: 'Participant not found' })
    }
    if (!resultado.ok) {
      // Recusa por regra (ex.: sem biometria): nada foi gravado.
      return res.status(422).json({ error: MENSAGEM_FALHA[resultado.falha], falha: resultado.falha })
    }
    const updatedParticipant = await prisma.participant.findUnique({
      where: { id: participantId }
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