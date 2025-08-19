import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Desativa todos os documentos padrão
    await prisma.documentConfig.updateMany({
      where: {
        documentType: {
          in: ['rg', 'cnh', 'cpf_doc', 'foto_3x4', 'comprovante_residencia']
        }
      },
      data: {
        active: false
      }
    })

    // Ou, se preferir deletar completamente:
    // await prisma.documentConfig.deleteMany({
    //   where: {
    //     documentType: {
    //       in: ['rg', 'cnh', 'cpf_doc', 'foto_3x4', 'comprovante_residencia']
    //     }
    //   }
    // })

    res.status(200).json({ 
      message: 'Documentos padrão desativados. Agora o admin precisa ativar manualmente os documentos necessários.' 
    })
  } catch (error) {
    console.error('Error clearing default documents:', error)
    res.status(500).json({ error: 'Failed to clear default documents' })
  }
}