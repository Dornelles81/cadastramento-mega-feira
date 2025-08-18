import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check for authorization
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  try {
    // Update all existing custom fields to be required
    const result = await prisma.customField.updateMany({
      where: {
        required: false
      },
      data: {
        required: true
      }
    })

    return res.status(200).json({ 
      message: 'Fields updated successfully',
      count: result.count 
    })
  } catch (error) {
    console.error('Error updating fields:', error)
    return res.status(500).json({ error: 'Failed to update fields' })
  }
}