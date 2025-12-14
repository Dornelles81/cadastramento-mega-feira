import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../../../lib/prisma'

interface StandImport {
  code: string
  name: string
  maxRegistrations: number
  description?: string
  location?: string
  responsibleName?: string
  responsibleEmail?: string
  responsiblePhone?: string
  isActive?: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
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

  const { slug } = req.query
  const { stands } = req.body as { stands: StandImport[] }

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'Slug do evento é obrigatório' })
    return
  }

  if (!stands || !Array.isArray(stands) || stands.length === 0) {
    res.status(400).json({ error: 'Lista de stands é obrigatória' })
    return
  }

  try {
    // Find event by slug
    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      res.status(404).json({ error: 'Evento não encontrado' })
      return
    }

    let created = 0
    let updated = 0

    // Process each stand
    for (const standData of stands) {
      // Check if stand already exists
      const existingStand = await prisma.stand.findFirst({
        where: {
          eventId: event.id,
          code: standData.code
        }
      })

      if (existingStand) {
        // Update existing stand
        await prisma.stand.update({
          where: { id: existingStand.id },
          data: {
            name: standData.name,
            maxRegistrations: standData.maxRegistrations,
            description: standData.description || null,
            location: standData.location || null,
            responsibleName: standData.responsibleName || null,
            responsibleEmail: standData.responsibleEmail || null,
            responsiblePhone: standData.responsiblePhone || null,
            isActive: standData.isActive !== false
          }
        })
        updated++
      } else {
        // Create new stand
        await prisma.stand.create({
          data: {
            code: standData.code,
            name: standData.name,
            maxRegistrations: standData.maxRegistrations,
            description: standData.description || null,
            location: standData.location || null,
            responsibleName: standData.responsibleName || null,
            responsibleEmail: standData.responsibleEmail || null,
            responsiblePhone: standData.responsiblePhone || null,
            isActive: standData.isActive !== false,
            eventId: event.id,
            eventCode: event.code
          }
        })
        created++
      }
    }

    res.status(200).json({
      success: true,
      created,
      updated,
      total: stands.length
    })

  } catch (error: any) {
    console.error('Error importing stands:', error)
    res.status(500).json({
      error: 'Erro ao importar stands',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}
