import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  // Disable cache to ensure fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    // ========================================================================
    // EVENT FILTER: Support optional eventCode or eventId query parameter
    // ========================================================================
    const { eventCode, eventId } = req.query

    let whereClause: any = {}

    if (eventCode && typeof eventCode === 'string') {
      // Filter by event code
      whereClause.eventCode = eventCode
      console.log('🔍 Filtering by eventCode:', eventCode)
    } else if (eventId && typeof eventId === 'string') {
      // Filter by event ID
      whereClause.eventId = eventId
      console.log('🔍 Filtering by eventId:', eventId)
    } else {
      // No filter - return all (for backward compatibility)
      console.log('⚠️  No event filter - returning all participants')
    }

    // ========================================================================
    // QUERY: Get participants with optional event filter
    // ========================================================================
    const participants = await prisma.participant.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        phone: true,
        eventCode: true,
        eventId: true,
        createdAt: true,
        consentAccepted: true,
        captureQuality: true,
        faceImageUrl: true, // This now contains the full face image
        faceData: false, // Don't send encrypted data to frontend
        customData: true,
        documents: true, // Include documents field
        approvalStatus: true, // Include approval status
        approvedAt: true,
        approvedBy: true,
        rejectionReason: true,
        standId: true, // Stand ID
        stand: {
          select: {
            code: true,
            name: true
          }
        },
        event: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 participants
    })

    console.log(`✅ Returning ${participants.length} participants`)

    // Format response
    const formattedParticipants = participants.map(participant => ({
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf,
      email: participant.email || '',
      phone: participant.phone || '',
      eventCode: participant.eventCode || 'MEGA-FEIRA-2025',
      eventId: participant.eventId,
      eventName: participant.event?.name || '',
      eventSlug: participant.event?.slug || '',
      createdAt: participant.createdAt.toISOString(),
      consentAccepted: participant.consentAccepted,
      captureQuality: participant.captureQuality || 0,
      hasValidFace: (participant.captureQuality || 0) > 0.5,
      faceImageUrl: participant.faceImageUrl || '',
      customData: participant.customData || {},
      documents: participant.documents || {},
      approvalStatus: participant.approvalStatus || 'pending',
      approvedAt: participant.approvedAt?.toISOString() || null,
      approvedBy: participant.approvedBy || null,
      rejectionReason: participant.rejectionReason || null,
      standCode: participant.stand?.code || null,
      standName: participant.stand?.name || null
    }))

    res.status(200).json({
      participants: formattedParticipants,
      total: formattedParticipants.length
    })

  } catch (error: any) {
    console.error('Admin participants query error:', error)

    res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao consultar participantes'
    })
  } finally {
    await prisma.$disconnect()
  }
}