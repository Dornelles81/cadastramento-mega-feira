import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

// Mock registration API for development/testing
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
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    const { name, cpf, event, mesa, email, phone, faceImage } = req.body

    // Basic validation
    if (!name || !cpf || !event || !mesa || !phone || !faceImage) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Nome, CPF, telefone, evento, mesa e imagem facial são obrigatórios' 
      })
    }

    // CPF validation
    const cpfNumbers = cpf.replace(/\D/g, '')
    if (cpfNumbers.length !== 11) {
      return res.status(400).json({ 
        error: 'Invalid CPF',
        message: 'CPF inválido' 
      })
    }

    // Simulate duplicate CPF check (10% chance)
    if (Math.random() < 0.1) {
      return res.status(409).json({ 
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado no sistema' 
      })
    }

    // Generate fake registration ID
    const registrationId = crypto.randomBytes(16).toString('hex')

    console.log(`✅ Mock registration successful:`, {
      id: registrationId,
      name,
      cpf: cpfNumbers,
      event,
      mesa,
      timestamp: new Date().toISOString()
    })

    // Return success response
    res.status(201).json({
      success: true,
      registrationId,
      message: 'Cadastro realizado com sucesso',
      participant: {
        id: registrationId,
        name,
        eventCode: 'MEGA-FEIRA-2025',
        registeredAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Mock registration error:', error)
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  }
}