import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API to verify participant by ID (used when scanning QR Code)
 *
 * GET /api/verificar/[id]
 *
 * Returns participant data for verification at event entrance
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Participant ID is required' })
    }

    // Support both full ID and short ID (8 chars)
    const participant = await prisma.participant.findFirst({
      where: id.length === 8
        ? { id: { startsWith: id.toLowerCase() } }
        : { id },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            startDate: true,
            endDate: true,
            status: true
          }
        },
        stand: {
          select: {
            code: true,
            name: true
          }
        }
      }
    })

    if (!participant) {
      return res.status(404).json({
        valid: false,
        error: 'Participante não encontrado',
        message: 'O QR Code escaneado não corresponde a nenhum cadastro válido.'
      })
    }

    // Check if participant is approved
    const isApproved = participant.approvalStatus === 'approved'
    const isPending = !participant.approvalStatus || participant.approvalStatus === 'pending'
    const isRejected = participant.approvalStatus === 'rejected'

    // Check if event is active
    const now = new Date()
    const eventStart = participant.event ? new Date(participant.event.startDate) : null
    const eventEnd = participant.event ? new Date(participant.event.endDate) : null
    const isEventActive = participant.event?.status === 'active'
    const isWithinEventDates = eventStart && eventEnd
      ? now >= eventStart && now <= eventEnd
      : true

    // Build response
    const response = {
      valid: true,
      verified: isApproved && isEventActive,
      participant: {
        id: participant.id,
        shortId: participant.id.substring(0, 8).toUpperCase(),
        name: participant.name,
        cpf: participant.cpf,
        email: participant.email,
        phone: participant.phone,
        faceImageUrl: participant.faceImageUrl,
        approvalStatus: participant.approvalStatus || 'pending',
        registeredAt: participant.createdAt
      },
      event: participant.event ? {
        name: participant.event.name,
        code: participant.event.code,
        status: participant.event.status,
        startDate: participant.event.startDate,
        endDate: participant.event.endDate,
        isActive: isEventActive,
        isWithinDates: isWithinEventDates
      } : null,
      stand: participant.stand ? {
        code: participant.stand.code,
        name: participant.stand.name
      } : null,
      status: {
        isApproved,
        isPending,
        isRejected,
        canEnter: isApproved && isEventActive && isWithinEventDates,
        message: getStatusMessage(participant.approvalStatus, isEventActive, isWithinEventDates)
      },
      verifiedAt: new Date().toISOString()
    }

    return res.json(response)

  } catch (error) {
    console.error('Error verifying participant:', error)
    return res.status(500).json({
      valid: false,
      error: 'Erro interno',
      message: 'Ocorreu um erro ao verificar o participante.'
    })
  } finally {
    await prisma.$disconnect()
  }
}

function getStatusMessage(
  approvalStatus: string | null,
  isEventActive: boolean,
  isWithinEventDates: boolean
): string {
  if (!isEventActive) {
    return 'Evento não está ativo no momento.'
  }

  if (!isWithinEventDates) {
    return 'Fora do período do evento.'
  }

  switch (approvalStatus) {
    case 'approved':
      return '✅ Acesso liberado! Participante aprovado.'
    case 'rejected':
      return '❌ Acesso negado. Cadastro rejeitado.'
    case 'pending':
    default:
      return '⏳ Cadastro pendente de aprovação.'
  }
}
