import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { requireAuth, isSuperAdmin } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check authentication using NextAuth
    const session = await requireAuth(req, res)

    // Only Super Admins can manage system fields
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }
    const { fieldName, required, active, eventId } = req.body

    console.log('📋 Updating system field:', { fieldName, required, active, eventId })

    // Store system field settings per event
    // If eventId is provided, save per-event config; otherwise save global config
    // Use upsert for atomic operation to avoid duplicates

    const systemFieldName = `_system_${fieldName}`
    const eventIdValue = eventId || null

    // First, clean up any duplicates that may exist
    const existingConfigs = await prisma.customField.findMany({
      where: {
        fieldName: systemFieldName,
        eventId: eventIdValue
      }
    })

    if (existingConfigs.length > 1) {
      // Delete all but the first one
      console.log(`⚠️ Found ${existingConfigs.length} duplicates, cleaning up...`)
      const idsToDelete = existingConfigs.slice(1).map(c => c.id)
      await prisma.customField.deleteMany({
        where: { id: { in: idsToDelete } }
      })
    }

    // Now upsert (create or update)
    const config = await prisma.customField.upsert({
      where: {
        fieldName_eventId: {
          fieldName: systemFieldName,
          eventId: eventIdValue
        }
      },
      update: {
        required: required,
        active: active
      },
      create: {
        fieldName: systemFieldName,
        label: fieldName,
        type: 'system',
        required: required,
        active: active,
        order: -100, // System fields have negative order
        eventId: eventIdValue
      }
    })

    console.log('✅ System field config saved:', config.id)

    return res.status(200).json({
      success: true,
      message: 'System field updated successfully'
    })
  } catch (error: any) {
    console.error('Error in /api/admin/system-fields:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}