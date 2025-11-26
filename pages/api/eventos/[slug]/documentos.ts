import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * API Pública: Buscar documentos configurados para o evento
 *
 * GET - Retorna apenas documentos ativos e obrigatórios para o formulário público
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { slug } = req.query

    if (typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug inválido' })
    }

    // Find event
    const event = await prisma.event.findUnique({
      where: { slug, isActive: true }
    })

    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' })
    }

    // Get active documents for this event
    const documents = await prisma.documentConfig.findMany({
      where: {
        eventId: event.id,
        active: true
      },
      select: {
        id: true,
        documentType: true,
        label: true,
        description: true,
        required: true,
        enableOCR: true,
        acceptedFormats: true,
        maxSizeMB: true,
        order: true,
        icon: true,
        helpText: true
      },
      orderBy: {
        order: 'asc'
      }
    })

    return res.status(200).json({
      success: true,
      documents,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug
      }
    })
  } catch (error: any) {
    console.error('Error fetching event documents:', error)
    return res.status(500).json({
      error: 'Erro ao buscar documentos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  } finally {
    await prisma.$disconnect()
  }
}
