import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== 'Bearer admin-token-mega-feira-2025') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { participantId } = req.query

  try {
    const where = participantId ? { participantId: participantId.toString() } : {}
    
    const logs = await prisma.approvalLog.findMany({
      where,
      include: {
        participant: {
          select: {
            name: true,
            cpf: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 logs
    })

    res.status(200).json({ logs })

  } catch (error: any) {
    console.error('Error fetching approval logs:', error)
    res.status(500).json({ error: 'Failed to fetch approval logs', details: error.message })
  } finally {
    await prisma.$disconnect()
  }
}