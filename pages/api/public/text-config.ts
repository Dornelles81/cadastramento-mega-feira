import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
    // Return default values on error
    return res.status(200).json({
      successText: '✅ Acesso Liberado!\n\nSeu cadastro foi realizado com sucesso.\nGuarde seu comprovante de registro.',
      instructionsText: '📱 Como Usar\n\n1. Leia e aceite os termos\n2. Preencha seus dados pessoais\n3. Capture sua foto\n4. Aguarde a confirmação'
    })
  }
}