import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'
import crypto from 'crypto'
import Joi from 'joi'

// Simplified validation schema
const registrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  cpf: Joi.string().required(),
  email: Joi.string().email().allow('', null).optional(),
  phone: Joi.string().min(10).allow('', null).optional(), // Make phone optional
  eventCode: Joi.string().allow('', null).optional().default('MEGA-FEIRA-2025'), // Optional with default
  faceImage: Joi.string().required(),
  faceData: Joi.object().optional(), // Azure Face API data
  consent: Joi.boolean().valid(true).required(),
  customData: Joi.object().optional() // Allow any custom fields
})

// Simplified CPF validation
function isValidCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')
  
  if (numbers.length !== 11) return false
  if (/^(\d)\1{10}$/.test(numbers)) return false

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

// Simplified encryption
function simpleEncrypt(data: string): string {
  const key = process.env.MASTER_KEY || 'default-key'
  return crypto.createHash('sha256').update(data + key).digest('hex')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📥 Received registration request:', req.body)

    // Validate input
    const { error, value } = registrationSchema.validate(req.body)
    if (error) {
      console.log('❌ Validation failed:', error.details[0].message)
      return res.status(400).json({ 
        error: 'Validation failed', 
        message: error.details[0].message 
      })
    }

    const { name, cpf, email, phone, faceImage, faceData, consent, customData } = value
    
    // Get eventCode from customData if it exists, otherwise use default
    const eventCode = customData?.eventCode || customData?.evento || value.eventCode || 'MEGA-FEIRA-2025'
    console.log('🎯 Event code:', eventCode)
    
    // Clean CPF
    const cleanCPF = cpf.replace(/\D/g, '')
    console.log('🔍 Processing CPF:', cleanCPF)

    // Validate CPF
    if (!isValidCPF(cleanCPF)) {
      console.log('❌ Invalid CPF')
      return res.status(400).json({ 
        error: 'Invalid CPF',
        message: 'CPF inválido'
      })
    }

    // Check for duplicate CPF
    const existingUser = await prisma.participant.findUnique({
      where: { cpf: cleanCPF }
    })

    if (existingUser) {
      console.log('❌ CPF already exists')
      return res.status(409).json({
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado'
      })
    }

    // Process face image and Azure data
    let encryptedFaceData = null
    let faceImageUrl = null
    let captureQuality = 0.5 // Default quality
    
    // Extract quality score from face data
    if (faceData) {
      if (faceData.quality && typeof faceData.quality === 'number') {
        // Direct quality score from frontend
        captureQuality = faceData.quality
        console.log('📊 Face quality score from frontend:', captureQuality)
      } else if (faceData.qualityPercentage) {
        // Quality percentage from frontend
        captureQuality = faceData.qualityPercentage / 100
        console.log('📊 Face quality percentage:', faceData.qualityPercentage + '%')
      } else if (faceData.faceQuality && faceData.faceQuality.score) {
        // Azure Face API score
        captureQuality = faceData.faceQuality.score
        console.log('📊 Azure Face quality score:', captureQuality)
      } else if (faceData.brightness) {
        // Calculate quality based on brightness
        const brightness = faceData.brightness
        if (brightness >= 80 && brightness <= 160) {
          captureQuality = 0.8
        } else if (brightness >= 60 && brightness <= 180) {
          captureQuality = 0.7
        } else {
          captureQuality = 0.6
        }
        console.log('📊 Quality based on brightness:', brightness, '→', captureQuality)
      }
    }
    
    console.log('✅ Final capture quality:', captureQuality)
    
    // Store full face image for recognition
    if (faceImage && faceImage.includes(',')) {
      try {
        // Store the complete face image as data URL
        faceImageUrl = faceImage
        
        // Encrypt only the biometric metadata
        const dataToEncrypt = JSON.stringify({
          azureData: faceData,
          captureTimestamp: new Date().toISOString()
        })
        encryptedFaceData = Buffer.from(simpleEncrypt(dataToEncrypt))
      } catch (err) {
        console.log('⚠️ Face image processing failed, continuing without it')
        encryptedFaceData = Buffer.from(simpleEncrypt('placeholder'))
      }
    } else if (faceImage) {
      // If faceImage doesn't have data URL prefix, add it
      faceImageUrl = `data:image/jpeg;base64,${faceImage}`
      encryptedFaceData = Buffer.from(simpleEncrypt(JSON.stringify(faceData || {})))
    } else {
      encryptedFaceData = Buffer.from(simpleEncrypt('mock-data'))
    }

    // Separate documents from other custom data
    const { documents, ...otherCustomData } = customData || {}
    
    // Create participant
    const participant = await prisma.participant.create({
      data: {
        name: name.trim(),
        cpf: cleanCPF,
        email: email || null,
        phone: phone ? phone.replace(/\D/g, '') : '',
        eventCode: eventCode,
        faceImageUrl: faceImageUrl, // Store complete face image
        faceData: encryptedFaceData,
        captureQuality: captureQuality,
        consentAccepted: consent,
        consentIp: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown',
        consentDate: new Date(),
        deviceInfo: req.headers['user-agent'] || 'unknown',
        documents: documents || {}, // Store documents separately
        customData: otherCustomData || {} // Store other custom fields
      }
    })

    console.log('✅ Participant created successfully:', participant.id)

    return res.status(201).json({
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

  } catch (error: any) {
    console.error('💥 Registration error:', error)
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta
    })
    
    // Handle Prisma errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Duplicate entry',
        message: 'Este CPF já está cadastrado'
      })
    }
    
    if (error.code === 'P2025') {
      return res.status(400).json({
        error: 'Record not found',
        message: 'Registro não encontrado'
      })
    }
    
    if (error.code?.startsWith('P')) {
      // Other Prisma errors
      return res.status(400).json({
        error: 'Database error',
        message: 'Erro ao salvar dados. Verifique as informações e tente novamente.',
        details: error.message
      })
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}