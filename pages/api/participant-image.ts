import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

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

    // If we have faceData (encrypted), return a placeholder for now
    // In production, you would decrypt the actual image data
    if (participant.faceData) {
      // Create a placeholder with the person's initials
      const initials = participant.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
      
      const svg = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#4F46E5"/>
          <text x="50%" y="50%" font-family="Arial" font-size="48" fill="white" text-anchor="middle" dy=".3em">
            ${initials}
          </text>
        </svg>
      `
      
      const base64 = Buffer.from(svg).toString('base64')
      const dataUrl = `data:image/svg+xml;base64,${base64}`
      
      return res.status(200).json({ 
        imageUrl: dataUrl,
        type: 'placeholder',
        hasData: true,
        initials
      })
    }

    // No image available - return generic avatar
    const defaultAvatar = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPgogIDxjaXJjbGUgY3g9IjEwMCIgY3k9IjcwIiByPSIzMCIgZmlsbD0iIzliYTNhZiIvPgogIDxlbGxpcHNlIGN4PSIxMDAiIGN5PSIxNTAiIHJ4PSI1MCIgcnk9IjM1IiBmaWxsPSIjOWJhM2FmIi8+Cjwvc3ZnPg==`
    
    return res.status(200).json({ 
      imageUrl: defaultAvatar,
      type: 'default'
    })
  } catch (error) {
    console.error('Error fetching participant image:', error)
    return res.status(500).json({ error: 'Failed to fetch image' })
  }
}