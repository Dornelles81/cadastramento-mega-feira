import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { requireAuth, isSuperAdmin } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication using NextAuth
    const session = await requireAuth(req, res)

    // Only Super Admins can manage text config
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

  if (req.method === 'GET') {
    try {
      // Get text configurations from database
      const configs = await prisma.customField.findMany({
        where: {
          fieldName: {
            in: ['_text_success', '_text_instructions', '_text_whatsapp_approval']
          }
        }
      })

      const configMap: any = {
        successText: '✅ Acesso Liberado!\n\nSeu cadastro foi realizado com sucesso.\nGuarde seu comprovante de registro.',
        instructionsText: '📱 Como Usar\n\n1. Leia e aceite os termos\n2. Preencha seus dados pessoais\n3. Capture sua foto\n4. Aguarde a confirmação',
        whatsappApprovalText: 'Olá {nome}! 🎉\n\nSeu cadastro para o evento *{evento}* foi *APROVADO* com sucesso!\n\nVocê já pode acessar o evento utilizando o reconhecimento facial.\n\nLembre-se de levar um documento com foto para eventual verificação.\n\nNos vemos lá!\n\n_Equipe Mega Feira_'
      }

      configs.forEach(config => {
        if (config.fieldName === '_text_success') {
          configMap.successText = config.label || configMap.successText
        }
        if (config.fieldName === '_text_instructions') {
          configMap.instructionsText = config.label || configMap.instructionsText
        }
        if (config.fieldName === '_text_whatsapp_approval') {
          configMap.whatsappApprovalText = config.label || configMap.whatsappApprovalText
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
      const { successText, instructionsText, whatsappApprovalText } = req.body

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

      // Save WhatsApp approval text
      if (whatsappApprovalText !== undefined) {
        const existing = await prisma.customField.findFirst({
          where: { fieldName: '_text_whatsapp_approval' }
        })

        if (existing) {
          await prisma.customField.update({
            where: { id: existing.id },
            data: { label: whatsappApprovalText }
          })
        } else {
          await prisma.customField.create({
            data: {
              fieldName: '_text_whatsapp_approval',
              label: whatsappApprovalText,
              type: 'text_config',
              required: false,
              active: true,
              order: -202
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
  } catch (error: any) {
    console.error('Error in /api/admin/text-config:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}