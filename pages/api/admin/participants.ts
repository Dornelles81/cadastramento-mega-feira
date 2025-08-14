import type { NextApiRequest, NextApiResponse } from 'next'

// Mock database - in real app this would come from NEON database
let mockParticipants = [
  {
    id: '1',
    name: 'João Silva',
    cpf: '123.456.789-00',
    email: 'joao@email.com',
    phone: '(11) 99999-1234',
    event: 'expointer',
    mesa: '01',
    registeredAt: '2025-08-14T10:30:00Z',
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
    cpf: '987.654.321-00',
    phone: '(11) 98888-5678',
    event: 'freio-de-ouro',
    mesa: '15',
    registeredAt: '2025-08-14T11:15:00Z',
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
    cpf: '456.789.123-00',
    email: 'carlos@email.com',
    phone: '(11) 97777-9012',
    event: 'morfologia',
    mesa: '33',
    registeredAt: '2025-08-14T09:45:00Z',
    faceImage: {
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAxQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==',
      metadata: {
        width: 640,
        height: 480,
        format: 'jpeg',
        quality: 0.9,
        fileSize: 48923,
        capturedAt: '2025-08-14T09:45:00Z'
      }
    }
  },
  {
    id: '4',
    name: 'Ana Costa',
    cpf: '321.654.987-00',
    email: 'ana@email.com',
    event: 'expointer',
    mesa: '07',
    registeredAt: '2025-08-14T08:20:00Z'
  },
  {
    id: '5',
    name: 'Pedro Mendes',
    cpf: '789.123.456-00',
    phone: '(11) 95555-3456',
    event: 'morfologia',
    mesa: '42',
    registeredAt: '2025-08-14T12:00:00Z'
  }
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    if (req.method === 'GET') {
      // Get all participants with optional filtering
      const { search, event } = req.query

      let filtered = mockParticipants

      // Filter by search term (name or CPF)
      if (search && typeof search === 'string') {
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.cpf.includes(search)
        )
      }

      // Filter by event
      if (event && typeof event === 'string') {
        filtered = filtered.filter(p => p.event === event)
      }

      res.status(200).json({
        success: true,
        participants: filtered,
        total: mockParticipants.length,
        filtered: filtered.length
      })
    }

    else if (req.method === 'PUT') {
      // Update participant
      const { id, ...updateData } = req.body

      const participantIndex = mockParticipants.findIndex(p => p.id === id)
      if (participantIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Participante não encontrado'
        })
      }

      mockParticipants[participantIndex] = {
        ...mockParticipants[participantIndex],
        ...updateData
      }

      console.log(`✅ Participant updated:`, mockParticipants[participantIndex])

      res.status(200).json({
        success: true,
        participant: mockParticipants[participantIndex],
        message: 'Participante atualizado com sucesso'
      })
    }

    else if (req.method === 'DELETE') {
      // Delete participant
      const { id } = req.query

      const participantIndex = mockParticipants.findIndex(p => p.id === id)
      if (participantIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Participante não encontrado'
        })
      }

      const deletedParticipant = mockParticipants.splice(participantIndex, 1)[0]
      
      console.log(`❌ Participant deleted:`, deletedParticipant)

      res.status(200).json({
        success: true,
        message: 'Participante excluído com sucesso'
      })
    }

    else if (req.method === 'POST') {
      // Add new participant (from registration form)
      const { name, cpf, event, mesa, email, phone } = req.body

      // Check if CPF already exists
      if (mockParticipants.find(p => p.cpf === cpf)) {
        return res.status(409).json({
          success: false,
          message: 'CPF já cadastrado'
        })
      }

      // Process face image if provided
      let faceImageData = null
      if (req.body.faceImage) {
        faceImageData = {
          data: req.body.faceImage,
          metadata: {
            width: req.body.imageWidth || 640,
            height: req.body.imageHeight || 480,
            format: req.body.imageFormat || 'jpeg',
            quality: req.body.imageQuality || 0.9,
            fileSize: Buffer.from(req.body.faceImage.split(',')[1] || '', 'base64').length,
            capturedAt: new Date().toISOString()
          }
        }
      }

      const newParticipant = {
        id: (mockParticipants.length + 1).toString(),
        name,
        cpf,
        event,
        mesa,
        phone,
        email: email || undefined,
        registeredAt: new Date().toISOString(),
        ...(faceImageData && { faceImage: faceImageData })
      }

      mockParticipants.push(newParticipant)

      console.log(`➕ New participant added:`, newParticipant)

      res.status(201).json({
        success: true,
        participant: newParticipant,
        message: 'Participante cadastrado com sucesso'
      })
    }

    else {
      res.status(405).json({
        success: false,
        message: 'Método não permitido'
      })
    }
  } catch (error) {
    console.error('Admin API error:', error)
    
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    })
  }
}