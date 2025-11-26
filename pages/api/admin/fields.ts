import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { invalidateFieldsCache } from '../../../lib/cache'
import { requireAuth, isSuperAdmin } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication using NextAuth
    const session = await requireAuth(req, res)

    // Only Super Admins can manage fields
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }
  // GET - List all custom fields (excluding text configs)
  if (req.method === 'GET') {
    try {
      const { eventId } = req.query

      console.log('📋 Fetching fields for eventId:', eventId)

      // Get all fields for this event (includes regular fields and system fields)
      const fields = await prisma.customField.findMany({
        where: eventId ? { eventId: eventId as string } : undefined,
        orderBy: { order: 'asc' }
      })

      console.log('📦 Found fields:', fields.length, fields.map(f => ({ name: f.fieldName, eventId: f.eventId })))

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
      const { eventId, fieldName, label, type, required, placeholder, options, order, active, validation } = req.body

      // Validate required fields
      if (!fieldName || !label || !type) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'fieldName, label, and type are required'
        })
      }

      // Check if field name already exists for this event
      const existing = await prisma.customField.findFirst({
        where: {
          fieldName,
          eventId: eventId || null
        }
      })

      if (existing) {
        return res.status(400).json({ error: 'Field name already exists for this event' })
      }

      const field = await prisma.customField.create({
        data: {
          eventId: eventId || null,
          fieldName,
          label,
          type,
          required: required || false,
          placeholder,
          options: options ? options : null,
          validation: validation || null,
          order: order || 0,
          active: active !== false
        }
      })

      // Invalidate cache after creating field
      invalidateFieldsCache(eventId)

      return res.status(201).json({ field })
    } catch (error) {
      console.error('Error creating field:', error)
      return res.status(500).json({ error: 'Failed to create field' })
    }
  }

  // PUT - Update existing field
  if (req.method === 'PUT') {
    try {
      const { id, eventId, fieldName, label, type, required, placeholder, options, order, active, validation } = req.body

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
          eventId: eventId || null,
          fieldName,
          label,
          type,
          required,
          placeholder,
          options: options ? options : null,
          validation: validation || null,
          order,
          active
        }
      })

      // Invalidate cache after updating field
      invalidateFieldsCache(eventId)

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

      // Get field before deleting to get eventId for cache invalidation
      const fieldToDelete = await prisma.customField.findUnique({
        where: { id },
        select: { eventId: true }
      })

      await prisma.customField.delete({
        where: { id }
      })

      // Invalidate cache after deleting field
      if (fieldToDelete) {
        invalidateFieldsCache(fieldToDelete.eventId || undefined)
      }

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error deleting field:', error)
      return res.status(500).json({ error: 'Failed to delete field' })
    }
  }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in /api/admin/fields:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}