import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    // Get all participants with full data including documents
    const participants = await prisma.participant.findMany({
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        phone: true,
        eventCode: true,
        createdAt: true,
        consentAccepted: true,
        captureQuality: true,
        faceImageUrl: true, // This now contains the full face image
        faceData: false, // Don't send encrypted data to frontend
        customData: true,
        documents: true // Include documents field
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 participants
    })

    // Format response
    const formattedParticipants = participants.map(participant => ({
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf,
      email: participant.email || '',
      phone: participant.phone || '',
      eventCode: participant.eventCode || 'MEGA-FEIRA-2025',
      createdAt: participant.createdAt.toISOString(),
      consentAccepted: participant.consentAccepted,
      captureQuality: participant.captureQuality || 0,
      hasValidFace: (participant.captureQuality || 0) > 0.5,
      faceImageUrl: participant.faceImageUrl || '',
      customData: participant.customData || {},
      documents: participant.documents || {}
    }))

    res.status(200).json({ 
      participants: formattedParticipants,
      total: formattedParticipants.length 
    })

  } catch (error) {
    console.error('Admin participants query error:', error)
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erro ao consultar participantes'
    })
  } finally {
    await prisma.$disconnect()
  }
}