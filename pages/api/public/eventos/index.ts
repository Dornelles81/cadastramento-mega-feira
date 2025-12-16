import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * API PUBLICA: Listar eventos publicos ativos
 * Nao requer autenticacao - usado na landing page
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Metodo nao permitido' })
    }

    const now = new Date()

    // Fetch only public and active events
    const events = await prisma.event.findMany({
      where: {
        isActive: true,
        isPublic: true,
        status: 'active',
        startDate: { lte: now },
        endDate: { gte: now }
      },
      select: {
        slug: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        maxCapacity: true,
        venueName: true,
        venueCity: true,
        _count: {
          select: {
            participants: {
              where: {
                isDeleted: false
              }
            }
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    })

    // Transform data
    const publicEvents = events.map(event => ({
      slug: event.slug,
      name: event.name,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      maxCapacity: event.maxCapacity,
      currentCount: event._count.participants,
      venueName: event.venueName,
      venueCity: event.venueCity
    }))

    return res.status(200).json({
      success: true,
      events: publicEvents,
      total: publicEvents.length
    })
  } catch (error) {
    console.error('Error fetching public events:', error)
    return res.status(500).json({ error: 'Erro ao buscar eventos' })
  }
}
