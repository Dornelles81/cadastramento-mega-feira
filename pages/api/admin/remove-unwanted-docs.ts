import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🗑️  Removing CNH and NR documents...')

    // Delete CNH and NR documents
    const deleted = await prisma.documentConfig.deleteMany({
      where: {
        documentType: {
          in: ['cnh', 'nr']
        }
      }
    })

    console.log(`✅ ${deleted.count} document(s) removed`)

    // Get remaining documents
    const remaining = await prisma.documentConfig.findMany({
      select: {
        documentType: true,
        label: true,
        active: true,
        required: true
      },
      orderBy: { order: 'asc' }
    })

    return res.status(200).json({
      success: true,
      message: `${deleted.count} document(s) removed successfully`,
      deletedCount: deleted.count,
      remainingDocuments: remaining
    })

  } catch (error) {
    console.error('Error removing documents:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to remove documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    await prisma.$disconnect()
  }
}
