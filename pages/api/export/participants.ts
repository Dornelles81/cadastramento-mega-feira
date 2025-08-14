import type { NextApiRequest, NextApiResponse } from 'next'

// Import mock data (in real app this would come from NEON database)
// For now, we'll simulate the same data structure
const getMockParticipants = () => [
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

/**
 * Export API for external systems integration
 * 
 * Endpoints:
 * GET /api/export/participants - List all participants with images
 * GET /api/export/participants?format=ultrathink - Format for Ultrathink system
 * GET /api/export/participants/[id] - Get single participant
 * GET /api/export/participants/[id]/image - Get participant image only
 * 
 * Query Parameters:
 * - format: 'standard' | 'ultrathink' | 'hikcenter' (default: 'standard')
 * - include_images: 'true' | 'false' (default: 'true')
 * - event: filter by event
 * - date_from, date_to: filter by registration date
 * - page, limit: pagination
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers for external system access
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')

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
    const {
      format = 'standard',
      include_images = 'true',
      event,
      date_from,
      date_to,
      page = '1',
      limit = '50'
    } = req.query

    let participants = getMockParticipants()

    // Apply filters
    if (event && typeof event === 'string') {
      participants = participants.filter(p => p.event === event)
    }

    if (date_from && typeof date_from === 'string') {
      participants = participants.filter(p => p.registeredAt >= date_from)
    }

    if (date_to && typeof date_to === 'string') {
      participants = participants.filter(p => p.registeredAt <= date_to)
    }

    // Apply pagination
    const pageNum = parseInt(page as string) || 1
    const limitNum = parseInt(limit as string) || 50
    const startIndex = (pageNum - 1) * limitNum
    const endIndex = startIndex + limitNum
    const paginatedParticipants = participants.slice(startIndex, endIndex)

    // Format response based on requested format
    let responseData: any

    switch (format) {
      case 'ultrathink':
        responseData = formatForUltrathink(paginatedParticipants, include_images === 'true')
        break
      
      case 'hikcenter':
        responseData = formatForHikCenter(paginatedParticipants, include_images === 'true')
        break
      
      case 'standard':
      default:
        responseData = formatStandard(paginatedParticipants, include_images === 'true')
        break
    }

    // Add pagination metadata
    const response = {
      ...responseData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: participants.length,
        pages: Math.ceil(participants.length / limitNum),
        hasNext: endIndex < participants.length,
        hasPrev: pageNum > 1
      },
      generated_at: new Date().toISOString(),
      format: format
    }

    console.log(`📊 Export request: format=${format}, participants=${paginatedParticipants.length}, page=${pageNum}`)

    res.status(200).json(response)

  } catch (error) {
    console.error('Export API error:', error)
    
    res.status(500).json({
      error: 'Export failed',
      message: 'Erro interno do servidor ao exportar dados'
    })
  }
}

// Format for Ultrathink system integration
function formatForUltrathink(participants: any[], includeImages: boolean) {
  return {
    system: 'mega-feira',
    version: '1.0.0',
    export_type: 'ultrathink',
    participants: participants.map(p => ({
      external_id: p.id,
      full_name: p.name,
      document: p.cpf,
      email: p.email || null,
      phone: p.phone || null,
      event_code: p.event,
      table_number: p.mesa,
      registration_timestamp: p.registeredAt,
      biometric_data: includeImages && p.faceImage ? {
        image_base64: p.faceImage.data,
        image_format: p.faceImage.metadata.format,
        image_quality: p.faceImage.metadata.quality,
        dimensions: {
          width: p.faceImage.metadata.width,
          height: p.faceImage.metadata.height
        },
        captured_at: p.faceImage.metadata.capturedAt,
        file_size_bytes: p.faceImage.metadata.fileSize
      } : null
    }))
  }
}

// Format for HikCenter system integration
function formatForHikCenter(participants: any[], includeImages: boolean) {
  return {
    system_name: 'MegaFeira',
    batch_id: `BATCH_${Date.now()}`,
    personnel: participants.map((p, index) => ({
      employeeNo: p.id,
      name: p.name,
      userType: 'normal',
      Valid: {
        enable: true,
        beginTime: p.registeredAt,
        endTime: '2025-12-31T23:59:59Z'
      },
      doorRight: '1',
      RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      faceData: includeImages && p.faceImage ? {
        faceLibType: 'blackFD',
        libMatching: {
          libID: '1',
          FDID: p.id,
          FPID: p.id
        },
        face: {
          binaryData: p.faceImage.data.split(',')[1] // Remove data:image/jpeg;base64, prefix
        }
      } : null,
      customInfo: {
        event: p.event,
        mesa: p.mesa,
        phone: p.phone,
        email: p.email
      }
    }))
  }
}

// Standard format for general integrations
function formatStandard(participants: any[], includeImages: boolean) {
  return {
    success: true,
    data: participants.map(p => ({
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      email: p.email,
      phone: p.phone,
      event: p.event,
      mesa: p.mesa,
      registered_at: p.registeredAt,
      has_face_image: !!p.faceImage,
      face_image: includeImages && p.faceImage ? {
        data: p.faceImage.data,
        metadata: p.faceImage.metadata
      } : undefined
    }))
  }
}