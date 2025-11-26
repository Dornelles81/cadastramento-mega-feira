import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const prisma = new PrismaClient({
    log: ['query', 'error', 'warn'],
  })

  try {
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...')

    const count = await prisma.participant.count()

    res.status(200).json({
      success: true,
      count,
      message: 'Connection successful'
    })
  } catch (error: any) {
    console.error('Test error:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    })
  } finally {
    await prisma.$disconnect()
  }
}
