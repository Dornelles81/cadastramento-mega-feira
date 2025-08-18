import { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

// Get password from environment or use default (CHANGE IN PRODUCTION!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'megafeira2025'
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex')
const SECRET_KEY = process.env.SECRET_KEY || 'mega-feira-secret-key-2025'

function generateToken(timestamp: number): string {
  const data = `${timestamp}-${SECRET_KEY}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

function verifyToken(token: string): boolean {
  try {
    // Token is valid for 24 hours
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    
    // Check last 24 hours of possible tokens
    for (let i = 0; i < 24; i++) {
      const timestamp = now - (i * 60 * 60 * 1000)
      const validToken = generateToken(Math.floor(timestamp / (60 * 60 * 1000)))
      if (token === validToken) {
        return true
      }
    }
    
    return false
  } catch (error) {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle login
  if (req.method === 'POST') {
    const { password, action } = req.body

    if (action === 'login') {
      // Hash the provided password and compare
      const providedHash = crypto.createHash('sha256').update(password).digest('hex')
      
      if (providedHash === ADMIN_PASSWORD_HASH) {
        // Generate session token
        const timestamp = Math.floor(Date.now() / (60 * 60 * 1000))
        const token = generateToken(timestamp)
        
        return res.status(200).json({ 
          success: true, 
          token,
          message: 'Login realizado com sucesso'
        })
      } else {
        return res.status(401).json({ 
          success: false, 
          error: 'Senha incorreta'
        })
      }
    }

    if (action === 'verify') {
      const { token } = req.body
      
      if (verifyToken(token)) {
        return res.status(200).json({ 
          success: true,
          valid: true
        })
      } else {
        return res.status(401).json({ 
          success: false,
          valid: false,
          error: 'Token inválido ou expirado'
        })
      }
    }
  }

  // Handle verification
  if (req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token || !verifyToken(token)) {
      return res.status(401).json({ 
        success: false,
        error: 'Não autorizado'
      })
    }

    return res.status(200).json({ 
      success: true,
      message: 'Autorizado'
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}