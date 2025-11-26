import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'

const prisma = new PrismaClient()

/**
 * Export API for external systems integration
 *
 * Endpoints:
 * GET /api/export/participants - List all participants with images
 * GET /api/export/participants?format=excel - Export as Excel file
 * GET /api/export/participants?format=pdf - Export as PDF file
 * GET /api/export/participants?format=ultrathink - Format for Ultrathink system
 * GET /api/export/participants?format=hikcenter - Format for HikCenter system
 *
 * Query Parameters:
 * - format: 'standard' | 'excel' | 'pdf' | 'ultrathink' | 'hikcenter' (default: 'standard')
 * - include_images: 'true' | 'false' (default: 'true')
 * - event: filter by event
 * - stand: filter by single stand/estande code
 * - stands: filter by multiple stand codes (comma-separated, e.g., "BASF,BAYER,SYNGENTA")
 * - date_from, date_to: filter by registration date
 * - page, limit: pagination (not used for Excel/PDF)
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
      stand,
      stands,
      date_from,
      date_to,
      page = '1',
      limit = '50'
    } = req.query

    // Get participants from database
    let where: any = {}

    if (event && typeof event === 'string') {
      where.eventCode = event
    }

    if (date_from && typeof date_from === 'string') {
      where.createdAt = { ...where.createdAt, gte: new Date(date_from) }
    }

    if (date_to && typeof date_to === 'string') {
      where.createdAt = { ...where.createdAt, lte: new Date(date_to) }
    }

    // For Excel and PDF, get all records (no pagination)
    const isPaginatedFormat = !['excel', 'pdf'].includes(format as string)

    let participants = await prisma.participant.findMany({
      where,
      skip: isPaginatedFormat ? (parseInt(page as string) - 1) * parseInt(limit as string) : undefined,
      take: isPaginatedFormat ? parseInt(limit as string) : undefined,
      orderBy: { createdAt: 'desc' }
    })

    // Filter by stand(s) if provided (client-side filtering since it's in customData JSON field)
    // Support both 'stand' (single) and 'stands' (comma-separated list)
    const standFilter = stands || stand
    if (standFilter && typeof standFilter === 'string') {
      const standCodes = standFilter.split(',').map(s => s.trim())
      participants = participants.filter(p => {
        const customData = p.customData as any
        const standCode = customData?.standCode || customData?.estande
        return standCodes.includes(standCode)
      })
    }

    // Get total count - use filtered participants length if stand filter is applied
    const totalCount = standFilter ? participants.length : await prisma.participant.count({ where })

    // Format response based on requested format
    switch (format) {
      case 'excel':
        return exportAsExcel(participants, res)
      
      case 'pdf':
        return exportAsPDF(participants, res)
      
      case 'ultrathink':
        return exportAsUltrathink(participants, include_images === 'true', res, totalCount)
      
      case 'hikcenter':
        return exportAsHikCenter(participants, include_images === 'true', res, totalCount)
      
      case 'standard':
      default:
        return exportAsStandard(participants, include_images === 'true', res, {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: totalCount
        })
    }

  } catch (error) {
    console.error('Export API error:', error)
    
    res.status(500).json({
      error: 'Export failed',
      message: 'Erro interno do servidor ao exportar dados'
    })
  }
}

// Export as Excel file
function exportAsExcel(participants: any[], res: NextApiResponse) {
  // Prepare data for Excel
  const excelData = participants.map((p, index) => {
    const customData = p.customData as any
    const standCode = customData?.standCode || customData?.estande || '-'

    return {
      'ID': p.id,
      'Nome': p.name,
      'CPF': p.cpf,
      'Email': p.email || '-',
      'Telefone': p.phone || '-',
      'Stand': standCode,
      'Evento': formatEventName(p.eventCode),
      'Qualidade da Captura': p.captureQuality ? `${Math.round(p.captureQuality * 100)}%` : '-',
      'Data de Cadastro': new Date(p.createdAt).toLocaleString('pt-BR'),
      'Consentimento': p.consentAccepted ? 'Sim' : 'Não',
      'Dispositivo': p.deviceInfo || '-',
      'IP': p.consentIp || '-'
    }
  })

  // Create workbook and worksheet
  const ws = XLSX.utils.json_to_sheet(excelData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes')

  // Auto-size columns
  const maxWidths = excelData.reduce((widths, row) => {
    Object.keys(row).forEach((key, i) => {
      const value = row[key as keyof typeof row]?.toString() || ''
      widths[i] = Math.max(widths[i] || 10, value.length + 2, key.length + 2)
    })
    return widths
  }, {} as Record<number, number>)

  ws['!cols'] = Object.values(maxWidths).map(w => ({ wch: Math.min(w, 50) }))

  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

  // Send file as download
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="participantes_megafeira_${new Date().toISOString().slice(0, 10)}.xlsx"`)
  res.send(Buffer.from(excelBuffer))
}

// Export as PDF file - Simplified HTML version
function exportAsPDF(participants: any[], res: NextApiResponse) {
  // Generate HTML table
  const tableRows = participants.map((p, index) => {
    const customData = p.customData as any
    const standCode = customData?.standCode || customData?.estande || '-'

    return `
    <tr>
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${p.cpf}</td>
      <td>${p.email || '-'}</td>
      <td>${p.phone || '-'}</td>
      <td>${standCode}</td>
      <td>${formatEventName(p.eventCode)}</td>
      <td>${p.captureQuality ? `${Math.round(p.captureQuality * 100)}%` : '-'}</td>
      <td>${new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
    </tr>
    `
  }).join('')

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Relatório de Participantes - Mega Feira</title>
      <style>
        @page { size: A4 landscape; margin: 20mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; }
        h1 { color: #333; font-size: 18pt; margin-bottom: 10px; }
        p { margin: 5px 0; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background-color: #34495e; color: white; padding: 8px; text-align: left; font-size: 9pt; }
        td { border: 1px solid #ddd; padding: 6px; font-size: 9pt; }
        tr:nth-child(even) { background-color: #f5f5f5; }
        .header { margin-bottom: 20px; }
        .footer { margin-top: 20px; text-align: center; color: #999; font-size: 8pt; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Relatório de Participantes - Mega Feira</h1>
        <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
        <p>Total de registros: ${participants.length}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>CPF</th>
            <th>Email</th>
            <th>Telefone</th>
            <th>Stand</th>
            <th>Evento</th>
            <th>Qualidade</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      
      <div class="footer">
        <p>Mega Feira - Sistema de Cadastramento Facial</p>
      </div>
    </body>
    </html>
  `

  // Send HTML as response with PDF content type for browser to handle
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `inline; filename="participantes_megafeira_${new Date().toISOString().slice(0, 10)}.html"`)
  res.send(htmlContent)
}

// Format for Ultrathink system integration
function exportAsUltrathink(participants: any[], includeImages: boolean, res: NextApiResponse, total: number) {
  const responseData = {
    system: 'mega-feira',
    version: '1.0.0',
    export_type: 'ultrathink',
    participants: participants.map(p => ({
      external_id: p.id,
      full_name: p.name,
      document: p.cpf,
      email: p.email || null,
      phone: p.phone || null,
      event_code: p.eventCode,
      registration_timestamp: p.createdAt,
      biometric_data: includeImages && p.faceImageUrl ? {
        image_base64: p.faceImageUrl,
        image_quality: p.captureQuality,
        captured_at: p.createdAt
      } : null
    })),
    total_records: total,
    generated_at: new Date().toISOString()
  }
  
  res.status(200).json(responseData)
}

// Format for HikCenter system integration
function exportAsHikCenter(participants: any[], includeImages: boolean, res: NextApiResponse, total: number) {
  const responseData = {
    system_name: 'MegaFeira',
    batch_id: `BATCH_${Date.now()}`,
    personnel: participants.map((p, index) => ({
      employeeNo: p.id,
      name: p.name,
      userType: 'normal',
      Valid: {
        enable: true,
        beginTime: p.createdAt,
        endTime: '2025-12-31T23:59:59Z'
      },
      doorRight: '1',
      RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      faceData: includeImages && p.faceImageUrl ? {
        faceLibType: 'blackFD',
        libMatching: {
          libID: '1',
          FDID: p.id,
          FPID: p.id
        },
        face: {
          binaryData: p.faceImageUrl.split(',')[1] // Remove data URL prefix
        }
      } : null,
      customInfo: {
        event: p.eventCode,
        phone: p.phone,
        email: p.email
      }
    })),
    total_records: total,
    generated_at: new Date().toISOString()
  }
  
  res.status(200).json(responseData)
}

// Standard format for general integrations
function exportAsStandard(
  participants: any[], 
  includeImages: boolean, 
  res: NextApiResponse,
  pagination: { page: number, limit: number, total: number }
) {
  const responseData = {
    success: true,
    data: participants.map(p => ({
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      email: p.email,
      phone: p.phone,
      event: p.eventCode,
      registered_at: p.createdAt,
      has_face_image: !!p.faceImageUrl,
      capture_quality: p.captureQuality,
      face_image: includeImages && p.faceImageUrl ? p.faceImageUrl : undefined
    })),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      pages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page * pagination.limit < pagination.total,
      hasPrev: pagination.page > 1
    },
    generated_at: new Date().toISOString()
  }
  
  res.status(200).json(responseData)
}

// Helper function to format event names
function formatEventName(eventCode: string): string {
  const eventNames: Record<string, string> = {
    'expointer': 'Expointer',
    'freio-de-ouro': 'Freio de Ouro',
    'morfologia': 'Morfologia',
    'MEGA-FEIRA-2025': 'Mega Feira 2025'
  }
  return eventNames[eventCode] || eventCode
}