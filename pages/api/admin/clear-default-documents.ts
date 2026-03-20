import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { getSession } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res)
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

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