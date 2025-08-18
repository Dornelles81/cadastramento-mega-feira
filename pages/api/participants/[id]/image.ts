import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid participant ID' })
    }

    // Get participant with face image
    const participant = await prisma.participant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        faceImageUrl: true,
        faceData: true
      }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // Try to get image from faceImageUrl first (if stored as URL)
    if (participant.faceImageUrl) {
      return res.status(200).json({ 
        imageUrl: participant.faceImageUrl,
        type: 'url' 
      })
    }

    // If we have faceData (encrypted), we need to decrypt it
    // For now, return a placeholder since the data is encrypted
    if (participant.faceData) {
      // In production, you would decrypt the data here
      // For demo, we'll return a placeholder image
      const placeholderImage = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2UwZTBlMCIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4KICAgIEZhY2UgSW1hZ2UKICA8L3RleHQ+Cjwvc3ZnPg==`
      
      return res.status(200).json({ 
        imageUrl: placeholderImage,
        type: 'placeholder',
        hasData: true
      })
    }

    // No image available
    return res.status(200).json({ 
      imageUrl: null,
      type: 'none'
    })
  } catch (error) {
    console.error('Error fetching participant image:', error)
    return res.status(500).json({ error: 'Failed to fetch image' })
  }
}