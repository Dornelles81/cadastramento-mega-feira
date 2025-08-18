import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { eventCode } = req.query

    // Get all active custom fields
    const customFields = await prisma.customField.findMany({
      where: {
        active: true,
        ...(eventCode ? { 
          OR: [
            { eventCode: eventCode as string },
            { eventCode: null }
          ]
        } : {}),
        NOT: {
          fieldName: {
            startsWith: '_system_'
          }
        }
      },
      orderBy: { order: 'asc' }
    })

    // Get system field configurations
    const systemFieldConfigs = await prisma.customField.findMany({
      where: {
        fieldName: {
          startsWith: '_system_'
        }
      }
    })

    // Create a map of system field configurations
    const systemConfigMap = new Map()
    systemFieldConfigs.forEach(config => {
      const fieldName = config.fieldName.replace('_system_', '')
      systemConfigMap.set(fieldName, config)
    })

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

    return res.status(200).json({ 
      fields: allFields,
      customFieldsCount: customFields.length
    })
  } catch (error) {
    console.error('Error fetching form fields:', error)
    return res.status(500).json({ error: 'Failed to fetch form fields' })
  }
}