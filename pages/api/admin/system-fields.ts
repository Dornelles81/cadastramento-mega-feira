import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fieldName, required, active } = req.body

    // Store system field settings in a separate table or use custom settings
    // For now, we'll store them as a custom field with a special flag
    
    // Check if system field config exists
    const existingConfig = await prisma.customField.findFirst({
      where: {
        fieldName: `_system_${fieldName}`
      }
    })

    if (existingConfig) {
      // Update existing config
      await prisma.customField.update({
        where: { id: existingConfig.id },
        data: {
          required: required,
          active: active
        }
      })
    } else {
      // Create new config
      await prisma.customField.create({
        data: {
          fieldName: `_system_${fieldName}`,
          label: fieldName,
          type: 'system',
          required: required,
          active: active,
          order: -100 // System fields have negative order
        }
      })
    }

    return res.status(200).json({ 
      success: true,
      message: 'System field updated successfully' 
    })
  } catch (error) {
    console.error('Error updating system field:', error)
    return res.status(500).json({ error: 'Failed to update system field' })
  }
}