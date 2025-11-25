import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireAuth, isSuperAdmin } from '../../../../lib/auth'

const prisma = new PrismaClient()

/**
 * API: Buscar e atualizar evento específico (SUPER ADMIN apenas)
 *
 * GET - Buscar evento por slug
 * PATCH - Atualizar evento
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Require authentication
    const session = await requireAuth(req, res)

    // Check if super admin
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

    const { slug } = req.query

    if (typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug inválido' })
    }

    // GET - Buscar evento
    if (req.method === 'GET') {
      const event = await prisma.event.findUnique({
        where: { slug },
        include: {
          eventConfigs: true,
          _count: {
            select: {
              participants: true,
              stands: true,
              admins: true
            }
          }
        }
      })

      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado' })
      }

      return res.status(200).json({ event })
    }

    // PATCH - Atualizar evento
    if (req.method === 'PATCH') {
      const {
        name,
        description,
        startDate,
        endDate,
        maxCapacity,
        status,
        isActive,
        isPublic,
        // Organizer
        organizerName,
        organizerEmail,
        organizerPhone,
        // Venue
        venueName,
        venueAddress,
        venueCity,
        venueState,
        venueCountry,
        venuePostalCode,
        // EventConfig (customization)
        primaryColor,
        secondaryColor,
        accentColor,
        requireConsent,
        requireFace,
        requireDocuments,
        autoApprove,
        enableCheckIn,
        enableQRCode
      } = req.body

      // Find existing event
      const existingEvent = await prisma.event.findUnique({
        where: { slug },
        include: {
          eventConfigs: true
        }
      })

      if (!existingEvent) {
        return res.status(404).json({ error: 'Evento não encontrado' })
      }

      // Update event basic info
      const updatedEvent = await prisma.event.update({
        where: { slug },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate && { endDate: new Date(endDate) }),
          ...(maxCapacity && { maxCapacity: parseInt(maxCapacity) }),
          ...(status && { status }),
          ...(typeof isActive === 'boolean' && { isActive }),
          ...(typeof isPublic === 'boolean' && { isPublic }),
          updatedAt: new Date()
        }
      })

      // Update or create EventConfig
      if (primaryColor || secondaryColor || accentColor ||
          typeof requireConsent === 'boolean' ||
          typeof requireFace === 'boolean' ||
          typeof requireDocuments === 'boolean' ||
          typeof autoApprove === 'boolean' ||
          typeof enableCheckIn === 'boolean' ||
          typeof enableQRCode === 'boolean') {

        if (existingEvent.eventConfigs) {
          // Update existing config
          await prisma.eventConfig.update({
            where: { eventId: existingEvent.id },
            data: {
              ...(primaryColor && { primaryColor }),
              ...(secondaryColor && { secondaryColor }),
              ...(accentColor && { accentColor }),
              ...(typeof requireConsent === 'boolean' && { requireConsent }),
              ...(typeof requireFace === 'boolean' && { requireFace }),
              ...(typeof requireDocuments === 'boolean' && { requireDocuments }),
              ...(typeof autoApprove === 'boolean' && { autoApprove }),
              ...(typeof enableCheckIn === 'boolean' && { enableCheckIn }),
              ...(typeof enableQRCode === 'boolean' && { enableQRCode }),
              updatedAt: new Date()
            }
          })
        } else {
          // Create new config
          await prisma.eventConfig.create({
            data: {
              eventId: existingEvent.id,
              primaryColor: primaryColor || '#8B5CF6',
              secondaryColor: secondaryColor || '#EC4899',
              accentColor: accentColor || '#F59E0B',
              requireConsent: requireConsent !== undefined ? requireConsent : true,
              requireFace: requireFace !== undefined ? requireFace : true,
              requireDocuments: requireDocuments !== undefined ? requireDocuments : false,
              autoApprove: autoApprove !== undefined ? autoApprove : false,
              enableCheckIn: enableCheckIn !== undefined ? enableCheckIn : true,
              enableQRCode: enableQRCode !== undefined ? enableQRCode : true
            }
          })
        }
      }

      // Fetch updated event with all relations
      const finalEvent = await prisma.event.findUnique({
        where: { slug },
        include: {
          eventConfigs: true
        }
      })

      return res.status(200).json({
        success: true,
        event: finalEvent,
        message: 'Evento atualizado com sucesso'
      })
    }

    return res.status(405).json({ error: 'Método não permitido' })
  } catch (error: any) {
    console.error('Error in /api/admin/eventos/[slug]:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}
