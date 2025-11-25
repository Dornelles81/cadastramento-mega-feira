import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * API PÚBLICA: Buscar configurações de um evento
 * Não requer autenticação - usado no formulário público de cadastro
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    const { slug } = req.query

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug do evento é obrigatório' })
    }

    // Fetch event with config
    const event = await prisma.event.findUnique({
      where: { slug },
      include: {
        eventConfigs: true,
        _count: {
          select: {
            participants: {
              where: {
                isDeleted: false
              }
            }
          }
        }
      }
    })

    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' })
    }

    // Return public event data
    return res.status(200).json({
      success: true,
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        code: event.code,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        maxCapacity: event.maxCapacity,
        currentCount: event._count.participants,
        status: event.status,
        isActive: event.isActive,
        isPublic: event.isPublic,
        organizerName: event.organizerName,
        organizerEmail: event.organizerEmail,
        organizerPhone: event.organizerPhone,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        venueCity: event.venueCity,
        venueState: event.venueState,
        config: {
          logoUrl: event.eventConfigs?.logoUrl,
          primaryColor: event.eventConfigs?.primaryColor || '#8B5CF6',
          secondaryColor: event.eventConfigs?.secondaryColor || '#EC4899',
          accentColor: event.eventConfigs?.accentColor || '#F59E0B',
          welcomeMessage: event.eventConfigs?.welcomeMessage,
          successMessage: event.eventConfigs?.successMessage,
          consentText: event.eventConfigs?.consentText,
          requireConsent: event.eventConfigs?.requireConsent !== false,
          requireFace: event.eventConfigs?.requireFace !== false,
          requireDocuments: event.eventConfigs?.requireDocuments || false,
          autoApprove: event.eventConfigs?.autoApprove || false,
          enableCheckIn: event.eventConfigs?.enableCheckIn !== false,
          enableQRCode: event.eventConfigs?.enableQRCode !== false
        }
      }
    })
  } catch (error) {
    console.error('Error fetching event config:', error)
    return res.status(500).json({ error: 'Erro ao buscar evento' })
  }
}
