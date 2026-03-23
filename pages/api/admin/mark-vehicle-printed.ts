import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { vehicleIds } = req.body as { vehicleIds: string[] }

  if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
    return res.status(400).json({ error: 'vehicleIds required' })
  }

  try {
    const now = new Date()
    const adminId = (session.user as { id?: string }).id ?? 'unknown'

    await prisma.$executeRawUnsafe(
      `UPDATE vehicle_credentials
       SET credential_printed = true,
           credential_printed_at = $1,
           credential_printed_by = $2
       WHERE id = ANY($3::uuid[])`,
      now,
      adminId,
      vehicleIds
    )

    return res.status(200).json({ updated: vehicleIds.length })
  } catch (error: any) {
    console.error('Error marking vehicle credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}
