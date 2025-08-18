import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check for authorization
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  if (req.method === 'GET') {
    try {
      // Get text configurations from database
      const configs = await prisma.customField.findMany({
        where: {
          fieldName: {
            in: ['_text_success', '_text_instructions']
          }
        }
      })

      const configMap: any = {
        successText: '✅ Acesso Liberado!\n\nSeu cadastro foi realizado com sucesso.\nGuarde seu comprovante de registro.',
        instructionsText: '📱 Como Usar\n\n1. Leia e aceite os termos\n2. Preencha seus dados pessoais\n3. Capture sua foto\n4. Aguarde a confirmação'
      }

      configs.forEach(config => {
        if (config.fieldName === '_text_success') {
          configMap.successText = config.label || configMap.successText
        }
        if (config.fieldName === '_text_instructions') {
          configMap.instructionsText = config.label || configMap.instructionsText
        }
      })

      return res.status(200).json(configMap)
    } catch (error) {
      console.error('Error loading text config:', error)
      return res.status(500).json({ error: 'Failed to load text configuration' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const { successText, instructionsText } = req.body

      // Save success text
      if (successText !== undefined) {
        const existing = await prisma.customField.findFirst({
          where: { fieldName: '_text_success' }
        })

        if (existing) {
          await prisma.customField.update({
            where: { id: existing.id },
            data: { label: successText }
          })
        } else {
          await prisma.customField.create({
            data: {
              fieldName: '_text_success',
              label: successText,
              type: 'text_config',
              required: false,
              active: true,
              order: -200
            }
          })
        }
      }

      // Save instructions text
      if (instructionsText !== undefined) {
        const existing = await prisma.customField.findFirst({
          where: { fieldName: '_text_instructions' }
        })

        if (existing) {
          await prisma.customField.update({
            where: { id: existing.id },
            data: { label: instructionsText }
          })
        } else {
          await prisma.customField.create({
            data: {
              fieldName: '_text_instructions',
              label: instructionsText,
              type: 'text_config',
              required: false,
              active: true,
              order: -201
            }
          })
        }
      }

      return res.status(200).json({ 
        success: true,
        message: 'Text configuration saved successfully' 
      })
    } catch (error) {
      console.error('Error saving text config:', error)
      return res.status(500).json({ error: 'Failed to save text configuration' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}