import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireAuth, isSuperAdmin, createAuditLog } from '../../../../lib/auth'

const prisma = new PrismaClient()

/**
 * API: Criar novo evento (SUPER ADMIN apenas)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    // Require super admin
    const session = await requireAuth(req, res)
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

    // Validate required fields
    const {
      slug,
      name,
      code,
      description,
      startDate,
      endDate,
      maxCapacity,
      organizerName,
      organizerEmail,
      organizerPhone,
      venueName,
      venueAddress,
      venueCity,
      venueState,
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

    if (!slug || !name || !code || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Campos obrigatórios: slug, name, code, startDate, endDate'
      })
    }

    // Check if slug already exists
    const existingSlug = await prisma.event.findUnique({
      where: { slug }
    })

    if (existingSlug) {
      return res.status(400).json({
        error: 'Slug já existe. Escolha outro identificador único.'
      })
    }

    // Check if code already exists
    const existingCode = await prisma.event.findUnique({
      where: { code }
    })

    if (existingCode) {
      return res.status(400).json({
        error: 'Código já existe. Escolha outro código único.'
      })
    }

    // Create event
    const event = await prisma.event.create({
      data: {
        slug,
        name,
        code,
        description: description || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxCapacity: maxCapacity || 2000,
        currentCount: 0,
        status: 'active',
        isActive: true,
        isPublic: true,

        // Organizer
        organizerName: organizerName || null,
        organizerEmail: organizerEmail || null,
        organizerPhone: organizerPhone || null,

        // Venue
        venueName: venueName || null,
        venueAddress: venueAddress || null,
        venueCity: venueCity || null,
        venueState: venueState || null,

        // Theme
        theme: {
          primaryColor: primaryColor || '#8B5CF6',
          secondaryColor: secondaryColor || '#EC4899',
          accentColor: accentColor || '#F59E0B'
        },

        // Settings
        settings: {
          requireDocuments: requireDocuments || false,
          autoApprove: autoApprove || false,
          notifyParticipants: true
        },

        // Features
        features: {
          facialRecognition: requireFace !== false,
          documentUpload: requireDocuments || false,
          hikCentralSync: true
        },

        publishedAt: new Date()
      }
    })

    // Create event configuration
    await prisma.eventConfig.create({
      data: {
        eventId: event.id,
        primaryColor: primaryColor || '#8B5CF6',
        secondaryColor: secondaryColor || '#EC4899',
        accentColor: accentColor || '#F59E0B',
        requireConsent: requireConsent !== false,
        requireFace: requireFace !== false,
        requireDocuments: requireDocuments || false,
        autoApprove: autoApprove || false,
        enableCheckIn: enableCheckIn !== false,
        enableQRCode: enableQRCode !== false,
        enableExport: true,
        welcomeMessage: `Bem-vindo ao cadastramento do ${name}!`,
        successMessage: 'Cadastro realizado com sucesso! Aguardamos você no evento.',
        consentText: 'Autorizo o uso da minha imagem facial para controle de acesso ao evento.',
        notifyOnRegister: true,
        notifyOnApprove: false,
        adminEmail: organizerEmail || null
      }
    })

    // Create audit log
    await createAuditLog({
      adminId: session.user.id,
      eventId: event.id,
      action: 'CREATE_EVENT',
      entityType: 'event',
      entityId: event.id,
      description: `Super Admin ${session.user.name} criou evento ${event.name}`,
      metadata: {
        slug: event.slug,
        code: event.code,
        maxCapacity: event.maxCapacity
      },
      severity: 'INFO'
    })

    return res.status(201).json({
      success: true,
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        code: event.code,
        startDate: event.startDate,
        endDate: event.endDate
      },
      message: 'Evento criado com sucesso!'
    })
  } catch (error: any) {
    console.error('Error creating event:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao criar evento. Tente novamente.'
    })
  }
}
