import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth, isSuperAdmin } from '../../../../lib/auth'
import { prisma } from '../../../../lib/prisma'


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
        logoUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        requireConsent,
        requireFace,
        requireDocuments,
        autoApprove,
        enableCheckIn,
        enableQRCode,
        successMessage,
        // Política de credenciais e substituições (Fase 7)
        dayResetHour,
        substitutionQuotaEnabled,
        substitutionsPerSlot
      } = req.body

      // Validação server-side da política (nunca confiar no client)
      if (dayResetHour !== undefined) {
        const h = Number(dayResetHour)
        if (!Number.isInteger(h) || h < 0 || h > 23) {
          return res.status(400).json({ error: 'dayResetHour deve ser um inteiro entre 0 e 23' })
        }
      }
      if (substitutionQuotaEnabled !== undefined && typeof substitutionQuotaEnabled !== 'boolean') {
        return res.status(400).json({ error: 'substitutionQuotaEnabled deve ser booleano' })
      }
      if (substitutionsPerSlot !== undefined) {
        const n = Number(substitutionsPerSlot)
        if (!Number.isInteger(n) || n < 0) {
          return res.status(400).json({ error: 'substitutionsPerSlot deve ser um inteiro >= 0' })
        }
      }

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
      // IMPORTANT: Add 12:00:00 to dates to avoid timezone issues
      // When dates are stored as midnight UTC, they can appear as the previous day
      // in timezones west of UTC (like America/Sao_Paulo which is UTC-3)
      const updatedEvent = await prisma.event.update({
        where: { slug },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(startDate && { startDate: new Date(`${startDate}T12:00:00Z`) }),
          ...(endDate && { endDate: new Date(`${endDate}T12:00:00Z`) }),
          ...(maxCapacity && { maxCapacity: parseInt(maxCapacity) }),
          ...(status && { status }),
          ...(typeof isActive === 'boolean' && { isActive }),
          ...(typeof isPublic === 'boolean' && { isPublic }),
          // Política de credenciais (Fase 7). Nota: alterar dayResetHour NÃO
          // recalcula locks existentes — slotLockedUntil guarda o instante
          // absoluto calculado na exclusão; o novo horário vale só para as
          // próximas exclusões
          ...(dayResetHour !== undefined && { dayResetHour: Number(dayResetHour) }),
          ...(typeof substitutionQuotaEnabled === 'boolean' && { substitutionQuotaEnabled }),
          ...(substitutionsPerSlot !== undefined && { substitutionsPerSlot: Number(substitutionsPerSlot) }),
          updatedAt: new Date()
        }
      })

      // Mudança de política no meio de um evento precisa ficar rastreável:
      // audit log EVENT_POLICY_CHANGED com valores anteriores e novos
      const policyChanged =
        (dayResetHour !== undefined && Number(dayResetHour) !== existingEvent.dayResetHour) ||
        (typeof substitutionQuotaEnabled === 'boolean' &&
          substitutionQuotaEnabled !== existingEvent.substitutionQuotaEnabled) ||
        (substitutionsPerSlot !== undefined &&
          Number(substitutionsPerSlot) !== existingEvent.substitutionsPerSlot)
      if (policyChanged) {
        await prisma.auditLog.create({
          data: {
            eventId: existingEvent.id,
            action: 'EVENT_POLICY_CHANGED',
            entityType: 'event',
            entityId: existingEvent.id,
            actorType: 'admin',
            actorIdentifier: session.user?.email ?? null,
            adminEmail: session.user?.email ?? null,
            ip:
              ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() ||
              req.socket.remoteAddress ||
              null,
            userAgent: (req.headers['user-agent'] as string) ?? null,
            previousData: {
              dayResetHour: existingEvent.dayResetHour,
              substitutionQuotaEnabled: existingEvent.substitutionQuotaEnabled,
              substitutionsPerSlot: existingEvent.substitutionsPerSlot
            },
            newData: {
              dayResetHour: updatedEvent.dayResetHour,
              substitutionQuotaEnabled: updatedEvent.substitutionQuotaEnabled,
              substitutionsPerSlot: updatedEvent.substitutionsPerSlot
            },
            description: `Política de credenciais/substituições do evento ${existingEvent.slug} alterada`,
            severity: 'WARNING'
          }
        })
      }

      // Update or create EventConfig
      if (logoUrl !== undefined || primaryColor || secondaryColor || accentColor ||
          typeof requireConsent === 'boolean' ||
          typeof requireFace === 'boolean' ||
          typeof requireDocuments === 'boolean' ||
          typeof autoApprove === 'boolean' ||
          typeof enableCheckIn === 'boolean' ||
          typeof enableQRCode === 'boolean' ||
          successMessage !== undefined) {

        if (existingEvent.eventConfigs) {
          // Update existing config
          await prisma.eventConfig.update({
            where: { eventId: existingEvent.id },
            data: {
              ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
              ...(primaryColor && { primaryColor }),
              ...(secondaryColor && { secondaryColor }),
              ...(accentColor && { accentColor }),
              ...(typeof requireConsent === 'boolean' && { requireConsent }),
              ...(typeof requireFace === 'boolean' && { requireFace }),
              ...(typeof requireDocuments === 'boolean' && { requireDocuments }),
              ...(typeof autoApprove === 'boolean' && { autoApprove }),
              ...(typeof enableCheckIn === 'boolean' && { enableCheckIn }),
              ...(typeof enableQRCode === 'boolean' && { enableQRCode }),
              ...(successMessage !== undefined && { successMessage }),
              updatedAt: new Date()
            }
          })
        } else {
          // Create new config
          await prisma.eventConfig.create({
            data: {
              eventId: existingEvent.id,
              ...(logoUrl && { logoUrl }),
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

    // DELETE - Excluir evento
    if (req.method === 'DELETE') {
      const event = await prisma.event.findUnique({ where: { slug } })
      if (!event) return res.status(404).json({ error: 'Evento não encontrado' })

      await prisma.event.delete({ where: { slug } })

      return res.status(200).json({ success: true, message: 'Evento excluído com sucesso' })
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
