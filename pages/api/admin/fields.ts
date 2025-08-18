import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import crypto from 'crypto'

// Verify auth token
function verifyToken(token: string): boolean {
  try {
    const SECRET_KEY = process.env.SECRET_KEY || 'mega-feira-secret-key-2025'
    const now = Date.now()
    
    // Check last 24 hours of possible tokens
    for (let i = 0; i < 24; i++) {
      const timestamp = Math.floor((now - (i * 60 * 60 * 1000)) / (60 * 60 * 1000))
      const data = `${timestamp}-${SECRET_KEY}`
      const validToken = crypto.createHash('sha256').update(data).digest('hex')
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
  // Check authentication for all requests
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')
  
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  // GET - List all custom fields (excluding text configs)
  if (req.method === 'GET') {
    try {
      const fields = await prisma.customField.findMany({
        orderBy: { order: 'asc' }
      })
      
      // Filter out text configuration fields on the server side
      // They are managed through the dedicated text config UI
      const filteredFields = fields.filter(field => 
        !field.fieldName?.startsWith('_text_')
      )
      
      return res.status(200).json({ fields: filteredFields })
    } catch (error) {
      console.error('Error fetching fields:', error)
      return res.status(500).json({ error: 'Failed to fetch fields' })
    }
  }

  // POST - Create new field
  if (req.method === 'POST') {
    try {
      const { fieldName, label, type, required, placeholder, options, order, active } = req.body

      // Validate required fields
      if (!fieldName || !label || !type) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          details: 'fieldName, label, and type are required'
        })
      }

      // Check if field name already exists
      const existing = await prisma.customField.findUnique({
        where: { fieldName }
      })

      if (existing) {
        return res.status(400).json({ error: 'Field name already exists' })
      }

      const field = await prisma.customField.create({
        data: {
          fieldName,
          label,
          type,
          required: required || false,
          placeholder,
          options: options ? options : null,
          order: order || 0,
          active: active !== false
        }
      })

      return res.status(201).json({ field })
    } catch (error) {
      console.error('Error creating field:', error)
      return res.status(500).json({ error: 'Failed to create field' })
    }
  }

  // PUT - Update existing field
  if (req.method === 'PUT') {
    try {
      const { id, fieldName, label, type, required, placeholder, options, order, active } = req.body

      if (!id) {
        return res.status(400).json({ error: 'Field ID is required' })
      }

      // Validate required fields
      if (!fieldName || !label || !type) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          details: 'fieldName, label, and type are required'
        })
      }

      const field = await prisma.customField.update({
        where: { id },
        data: {
          fieldName,
          label,
          type,
          required,
          placeholder,
          options: options ? options : null,
          order,
          active
        }
      })

      return res.status(200).json({ field })
    } catch (error) {
      console.error('Error updating field:', error)
      return res.status(500).json({ error: 'Failed to update field' })
    }
  }

  // DELETE - Remove field
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Field ID is required' })
      }

      await prisma.customField.delete({
        where: { id }
      })

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error deleting field:', error)
      return res.status(500).json({ error: 'Failed to delete field' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}