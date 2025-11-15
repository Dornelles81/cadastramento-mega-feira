import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const allDocuments = await prisma.documentConfig.findMany({
      orderBy: { order: 'asc' }
    })

    const activeRequired = await prisma.documentConfig.findMany({
      where: {
        active: true,
        required: true
      },
      orderBy: { order: 'asc' }
    })

    return res.status(200).json({
      all: allDocuments,
      activeAndRequired: activeRequired,
      summary: {
        total: allDocuments.length,
        activeAndRequired: activeRequired.length,
        breakdown: allDocuments.map(doc => ({
          type: doc.documentType,
          active: doc.active,
          required: doc.required,
          shouldShow: doc.active && doc.required
        }))
      }
    })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    await prisma.$disconnect()
  }
}
