import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID is required' })
    }

    // Get participant data
    const participant = await prisma.participant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        phone: true,
        eventCode: true,
        customData: true,
        documents: true,
        faceImageUrl: true,
        standId: true,
        stand: {
          select: {
            code: true,
            name: true
          }
        }
      }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // Format response
    return res.status(200).json({
      success: true,
      participant: {
        id: participant.id,
        name: participant.name,
        cpf: participant.cpf,
        email: participant.email || '',
        phone: participant.phone || '',
        eventCode: participant.eventCode || '',
        customData: participant.customData || {},
        documents: participant.documents || {},
        faceImageUrl: participant.faceImageUrl || '',
        standCode: participant.stand?.code || ''
      }
    })

  } catch (error) {
    console.error('Error fetching participant:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao buscar participante'
    })
  } finally {
    await prisma.$disconnect()
  }
}
