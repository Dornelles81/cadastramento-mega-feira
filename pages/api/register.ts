import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import Joi from 'joi'

const prisma = new PrismaClient()

// Validation schema
const registrationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  cpf: Joi.string().pattern(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/).required(),
  email: Joi.string().email().optional().allow(''),
  phone: Joi.string().min(10).pattern(/^(\(\d{2}\)\s\d{5}-\d{4}|\d{10,11})$/).required(),
  eventCode: Joi.string().optional(),
  faceImage: Joi.string().required(), // Base64 image
  consent: Joi.boolean().valid(true).required()
})

// CPF validation algorithm
function validateCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')
  if (numbers.length !== 11 || /^(\d)\1{10}$/.test(numbers)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(numbers[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(numbers[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(numbers[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  return remainder === parseInt(numbers[10])
}

// Encrypt biometric data
function encryptBiometricData(data: string): Buffer {
  const masterKey = process.env.MASTER_KEY || 'a1b2c3d4e5f6789012345678901234567890abcd'
  const key = crypto.createHash('sha256').update(masterKey).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher('aes-256-cbc', key)
  
  let encrypted = cipher.update(data, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const result = Buffer.concat([iv, Buffer.from(encrypted, 'hex')])
  
  return result
}

// Get client IP address
function getClientIP(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded 
    ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
    : req.connection.remoteAddress || req.socket.remoteAddress
  
  return ip || 'unknown'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers for mobile
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    console.log('📥 Registration request body:', req.body)
    
    // Validate request data
    const { error, value } = registrationSchema.validate(req.body)
    if (error) {
      console.log('❌ Validation error:', error.details[0].message)
      console.log('❌ Full error details:', error.details)
      return res.status(400).json({ 
        error: 'Invalid data', 
        details: error.details[0].message 
      })
    }

    console.log('✅ Validation passed, extracting values...')
    const { name, cpf, email, phone, eventCode, faceImage, consent } = value

    // Validate CPF
    console.log('🔍 Validating CPF:', cpf)
    if (!validateCPF(cpf)) {
      console.log('❌ CPF validation failed')
      return res.status(400).json({ error: 'Invalid CPF' })
    }
    console.log('✅ CPF validation passed')

    // Check if CPF already exists
    const existingParticipant = await prisma.participant.findUnique({
      where: { cpf: cpf.replace(/\D/g, '') }
    })

    if (existingParticipant) {
      return res.status(409).json({ 
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado no sistema' 
      })
    }

    // Process face image
    const imageBuffer = Buffer.from(faceImage.split(',')[1], 'base64')
    const encryptedFaceData = encryptBiometricData(faceImage)

    // Simulate face quality score (in real implementation, use AI)
    const faceQuality = Math.random() * 0.3 + 0.7 // 0.7 to 1.0

    // Get client info for consent tracking
    const clientIP = getClientIP(req)
    const userAgent = req.headers['user-agent'] || 'unknown'

    // Create participant record
    const participant = await prisma.participant.create({
      data: {
        name: name.trim(),
        cpf: cpf.replace(/\D/g, ''),
        email: email?.trim() || null,
        phone: phone?.replace(/\D/g, '') || null,
        eventCode: eventCode || process.env.EVENT_CODE || 'MEGA-FEIRA-2025',
        
        // Biometric data (stored in NEON)
        faceImageUrl: null, // Could store in external storage
        faceData: encryptedFaceData,
        captureQuality: faceQuality,
        
        // Consent tracking (LGPD)
        consentAccepted: consent,
        consentIp: clientIP,
        consentDate: new Date(),
        
        // Device info
        deviceInfo: userAgent
      }
    })

    // Log successful registration (for audit)
    console.log(`New registration: ${participant.id} - ${name} (${cpf})`)

    // Return success response
    res.status(201).json({
      success: true,
      registrationId: participant.id,
      message: 'Cadastro realizado com sucesso',
      participant: {
        id: participant.id,
        name: participant.name,
        eventCode: participant.eventCode,
        registeredAt: participant.createdAt
      }
    })

  } catch (error) {
    console.error('Registration error:', error)
    
    // Handle specific database errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Duplicate entry',
        message: 'Este CPF já está cadastrado'
      })
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  } finally {
    await prisma.$disconnect()
  }
}