import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import Joi from 'joi'

const prisma = new PrismaClient()

// Query parameters validation
const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().optional(),
  eventCode: Joi.string().optional()
})

interface ParticipantListResponse {
  participants: Array<{
    id: string
    name: string
    cpf: string
    email?: string
    phone?: string
    eventCode: string
    registeredAt: string
    hasValidFace: boolean
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Mask CPF for privacy (show only first 3 and last 2 digits)
function maskCPF(cpf: string): string {
  if (cpf.length !== 11) return cpf
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`
}

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
    // Validate query parameters
    const { error, value } = querySchema.validate(req.query)
    if (error) {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: error.details[0].message 
      })
    }

    const { page, limit, search, eventCode } = value

    // Build where clause for filtering
    const whereClause: any = {}
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search.replace(/\D/g, '') } }
      ]
    }

    if (eventCode) {
      whereClause.eventCode = eventCode
    }

    // Get total count for pagination
    const total = await prisma.participant.count({ where: whereClause })

    // Get participants with pagination
    const participants = await prisma.participant.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        phone: true,
        eventCode: true,
        createdAt: true,
        captureQuality: true,
        faceData: false, // Don't return biometric data
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    })

    // Format response
    const formattedParticipants = participants.map(participant => ({
      id: participant.id,
      name: participant.name,
      cpf: maskCPF(participant.cpf),
      email: participant.email || undefined,
      phone: participant.phone || undefined,
      eventCode: participant.eventCode || '',
      registeredAt: participant.createdAt.toISOString(),
      hasValidFace: (participant.captureQuality || 0) > 0.7
    }))

    const response: ParticipantListResponse = {
      participants: formattedParticipants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }

    res.status(200).json(response)

  } catch (error) {
    console.error('Participants query error:', error)
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erro ao consultar participantes'
    })
  } finally {
    await prisma.$disconnect()
  }
}