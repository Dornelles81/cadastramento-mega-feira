import type { NextApiRequest, NextApiResponse } from 'next'

// Mock data (in production this would be from database)
const getMockParticipants = () => [
  {
    id: '1',
    name: 'João Silva',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.9,
        fileSize: 45672,
        capturedAt: '2025-08-14T10:30:00Z'
      }
    }
  },
  {
    id: '2',
    name: 'Maria Santos',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.85,
        fileSize: 42315,
        capturedAt: '2025-08-14T11:15:00Z'
      }
    }
  },
  {
    id: '3',
    name: 'Carlos Oliveira',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.9,
        fileSize: 48923,
        capturedAt: '2025-08-14T09:45:00Z'
      }
    }
  }
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    })
    return
  }

  try {
    const { id } = req.query
    const { format = 'base64', download = 'false' } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        error: 'Invalid participant ID',
        message: 'ID do participante é obrigatório'
      })
    }

    const participants = getMockParticipants()
    const participant = participants.find(p => p.id === id)

    if (!participant) {
      return res.status(404).json({
        error: 'Participant not found',
        message: 'Participante não encontrado'
      })
    }

    if (!participant.faceImage) {
      return res.status(404).json({
        error: 'No face image',
        message: 'Participante não possui imagem facial cadastrada'
      })
    }

    const image = participant.faceImage

    // Handle different response formats
    switch (format) {
      case 'metadata':
        res.status(200).json({
          participant_id: id,
          participant_name: participant.name,
          has_image: true,
          metadata: image.metadata
        })
        break

      case 'binary':
        const base64Data = image.data.split(',')[1]
        const imageBuffer = Buffer.from(base64Data, 'base64')
        
        res.setHeader('Content-Type', `image/${image.metadata.format}`)
        res.setHeader('Content-Length', imageBuffer.length.toString())
        
        if (download === 'true') {
          const filename = `participant_${id}_face.${image.metadata.format}`
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        }
        
        res.status(200).send(imageBuffer)
        break

      case 'base64':
      default:
        res.status(200).json({
          participant_id: id,
          participant_name: participant.name,
          image: {
            data: image.data,
            metadata: image.metadata
          }
        })
        break
    }

    console.log(`🖼️ Image export: participant=${id}, format=${format}`)

  } catch (error) {
    console.error('Image export error:', error)
    
    res.status(500).json({
      error: 'Image export failed',
      message: 'Erro interno ao exportar imagem'
    })
  }
}