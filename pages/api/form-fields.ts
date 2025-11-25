import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

// Updated to support event-specific fields
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { eventId: eventIdParam, eventCode } = req.query

    console.log('📋 form-fields request:', { eventIdParam, eventCode })

    // If eventCode is provided, get the event to find its ID
    // Suporta tanto slug (expofest-2026) quanto code (EXPOFEST-2026)
    let eventId = eventIdParam as string | undefined

    if (eventCode && !eventId) {
      const eventCodeStr = eventCode as string;

      // Primeiro tentar pelo slug (exato, minúsculas)
      let event = await prisma.event.findUnique({
        where: { slug: eventCodeStr.toLowerCase() },
        select: { id: true, name: true, code: true, slug: true }
      })

      // Se não encontrar pelo slug, tentar pelo code (maiúsculas)
      if (!event) {
        event = await prisma.event.findUnique({
          where: { code: eventCodeStr.toUpperCase() },
          select: { id: true, name: true, code: true, slug: true }
        })
      }

      console.log('🔍 Found event:', event)
      eventId = event?.id
    }

    console.log('🎯 Using eventId:', eventId)

    // Get all active custom fields for this event
    // IMPORTANT: If eventId is provided, ONLY include event-specific fields (NOT global ones)
    // Global fields (eventId: null) should only be included when no event is specified
    const customFields = await prisma.customField.findMany({
      where: {
        active: true,
        eventId: eventId || null, // Event-specific OR global (but not both)
        NOT: [
          { fieldName: { startsWith: '_system_' } },
          { fieldName: { startsWith: '_text_' } }
        ]
      },
      orderBy: { order: 'asc' }
    })

    console.log('📦 Found custom fields:', customFields.length, customFields.map(f => ({ name: f.fieldName, eventId: f.eventId })))

    // Get system field configurations - ONLY for the specific event or global (but not both)
    // Each event is completely isolated - if event has no configs, use code defaults
    const systemFieldConfigs = await prisma.customField.findMany({
      where: {
        fieldName: {
          startsWith: '_system_'
        },
        eventId: eventId || null // ONLY event-specific OR global (NOT both)
      }
    })

    console.log('🔧 System field configs found:', systemFieldConfigs.map(c => ({
      field: c.fieldName,
      eventId: c.eventId,
      required: c.required,
      active: c.active
    })))

    // Create a map of system field configurations
    // ONLY use configs from the specified event (or global if no event)
    // If event has no configs, defaults from code will be used (email=false, phone=false)
    const systemConfigMap = new Map()

    systemFieldConfigs.forEach(config => {
      const fieldName = config.fieldName.replace('_system_', '')
      systemConfigMap.set(fieldName, config)
    })

    console.log('📊 Final system config map:', Array.from(systemConfigMap.entries()).map(([k, v]) => ({
      field: k,
      required: v.required,
      active: v.active,
      eventId: v.eventId
    })))

    // Default system fields configuration with overrides from database
    const systemFields = [
      {
        fieldName: 'name',
        label: 'Nome Completo',
        type: 'text',
        required: systemConfigMap.get('name')?.required ?? true,
        active: systemConfigMap.get('name')?.active ?? true,
        placeholder: 'Digite seu nome completo',
        order: -5
      },
      {
        fieldName: 'cpf',
        label: 'CPF',
        type: 'text',
        required: systemConfigMap.get('cpf')?.required ?? true,
        active: systemConfigMap.get('cpf')?.active ?? true,
        placeholder: '000.000.000-00',
        order: -4
      },
      {
        fieldName: 'email',
        label: 'Email',
        type: 'email',
        required: systemConfigMap.get('email')?.required ?? false,
        active: systemConfigMap.get('email')?.active ?? false,
        placeholder: 'seu@email.com',
        order: -3
      },
      {
        fieldName: 'phone',
        label: 'Telefone',
        type: 'tel',
        required: systemConfigMap.get('phone')?.required ?? false,
        active: systemConfigMap.get('phone')?.active ?? false,
        placeholder: '(11) 99999-9999',
        order: -2
      }
    ]

    // Filter only active system fields and combine with custom fields
    const activeSystemFields = systemFields.filter(field => field.active)
    const allFields = [...activeSystemFields, ...customFields].sort((a, b) => a.order - b.order)

    // Add cache control headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    return res.status(200).json({
      fields: allFields,
      customFieldsCount: customFields.length,
      eventId: eventId || null
    })
  } catch (error) {
    console.error('Error fetching form fields:', error)
    return res.status(500).json({ error: 'Failed to fetch form fields' })
  }
}