import { NextApiRequest, NextApiResponse } from 'next'
import EvolutionClient, { formatApprovalMessage } from '../../../lib/whatsapp/evolution-client'
import { prisma } from '../../../lib/prisma'
import { getSession } from '../../../lib/auth'
import { aplicarAprovacao, atorDaSessao } from '../../../lib/participants/approval'


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication via NextAuth session
  const session = await getSession(req, res)
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { participantId, action, reason, notes } = req.body

  if (!participantId || !action) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' })
  }

  try {
    // Get current participant
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // Estado + fan-out + logs num lugar só (lib/participants/approval). O ator
    // sai da SESSÃO — antes esta linha gravava a string 'admin' fixa, com a
    // sessão já em mãos logo acima.
    const resultado = await aplicarAprovacao({
      participantId,
      acao: action,
      ator: atorDaSessao(session),
      motivo: reason ?? null,
      notas: notes ?? null,
      ip: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null
    })
    if (!resultado) {
      return res.status(404).json({ error: 'Participant not found' })
    }
    const previousStatus = resultado.statusAnterior
    const newStatus = resultado.statusNovo
    const updatedParticipant = await prisma.participant.findUnique({
      where: { id: participantId }
    })

    // approvalLog e auditLog são gravados por `aplicarAprovacao`, com o ator
    // real — não repetir aqui, senão cada aprovação produz dois registros e a
    // correção do ator valeria só para metade deles.

    // Send WhatsApp notification on approval
    let whatsappSent = false
    let whatsappError = null

    if (action === 'approve' && participant.phone) {
      try {
        console.log('Sending WhatsApp approval notification to:', participant.phone)

        // Get WhatsApp message template from config
        const textConfig = await prisma.customField.findFirst({
          where: { fieldName: '_text_whatsapp_approval' }
        })

        // Get event info for message
        let eventName = 'Mega Feira'
        let eventDate = ''
        if (participant.eventId) {
          const event = await prisma.event.findUnique({
            where: { id: participant.eventId },
            select: { name: true, startDate: true }
          })
          if (event) {
            eventName = event.name
            eventDate = event.startDate ? new Date(event.startDate).toLocaleDateString('pt-BR') : ''
          }
        }

        const messageTemplate = textConfig?.label ||
          'Ola {nome}!\n\nSeu cadastro para o evento *{evento}* foi *APROVADO* com sucesso!\n\nVoce ja pode acessar o evento utilizando o reconhecimento facial.\n\nNos vemos la!\n\n_Equipe Mega Feira_'

        const message = formatApprovalMessage(messageTemplate, {
          name: participant.name,
          cpf: participant.cpf,
          email: participant.email || '',
          phone: participant.phone || '',
          eventName: eventName,
          eventDate: eventDate
        })

        // Send via Evolution API
        const evolutionClient = new EvolutionClient()
        const sendResult = await evolutionClient.sendTextMessage({
          phone: participant.phone,
          message: message
        })

        if (sendResult.success) {
          whatsappSent = true
          console.log('WhatsApp notification sent successfully:', sendResult.messageId)
        } else {
          whatsappError = sendResult.error
          console.error('WhatsApp notification failed:', sendResult.error)
        }
      } catch (whatsappErr: any) {
        whatsappError = whatsappErr.message
        console.error('Error sending WhatsApp notification:', whatsappErr)
      }
    }

    res.status(200).json({
      success: true,
      participant: updatedParticipant,
      message: `Participant ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      whatsappSent: whatsappSent,
      whatsappError: whatsappError
    })

  } catch (error: any) {
    console.error('Error updating participant approval:', error?.message, error?.code, error?.meta)
    res.status(500).json({
      error: 'Erro ao aprovar participante',
      details: error.message,
      code: error.code
    })
  }
}