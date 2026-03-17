import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { participantIds } = req.body as { participantIds: string[] }

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'participantIds required' })
  }

  try {
    const now = new Date()
    const adminId = session.user.id

    // Use raw SQL since Prisma client may not have the new fields cached yet
    await prisma.$executeRawUnsafe(
      `UPDATE participants
       SET credential_printed = true,
           credential_printed_at = $1,
           credential_printed_by = $2
       WHERE id = ANY($3::uuid[])`,
      now,
      adminId,
      participantIds
    )

    return res.status(200).json({ updated: participantIds.length })
  } catch (error: any) {
    console.error('Error marking credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}
