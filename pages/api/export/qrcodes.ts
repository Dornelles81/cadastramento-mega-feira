import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import QRCode from 'qrcode'

interface QRPayload {
  id: string
  name: string
  cpf: string
  event: string
  stand: string
  standName: string
  ts: string
  v: string
}

/**
 * API to export QR Codes for participants
 *
 * GET /api/export/qrcodes?eventId=xxx&format=json|png|csv
 *
 * Formats:
 * - json: Array of participants with QR Code data URLs
 * - png: Single participant QR Code image (requires participantId)
 * - csv: CSV with participant data and QR payloads
 * - batch-json: Optimized for external software integration
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      eventId,
      eventCode,
      participantId,
      format = 'json',
      includeImage = 'true',
      standCode
    } = req.query

    // Single participant QR Code
    if (participantId && typeof participantId === 'string') {
      return await exportSingleQRCode(participantId, format as string, res)
    }

    // Batch export requires eventId or eventCode
    if (!eventId && !eventCode) {
      return res.status(400).json({
        error: 'eventId or eventCode is required for batch export',
        usage: {
          single: '/api/export/qrcodes?participantId=xxx&format=png',
          batch: '/api/export/qrcodes?eventId=xxx&format=json'
        }
      })
    }

    // Get event
    const event = await prisma.event.findFirst({
      where: eventId
        ? { id: eventId as string }
        : { code: eventCode as string }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // Get participants
    const whereClause: any = { eventId: event.id }
    if (standCode) {
      const stand = await prisma.stand.findFirst({
        where: { code: standCode as string, eventId: event.id }
      })
      if (stand) {
        whereClause.standId = stand.id
      }
    }

    const participants = await prisma.participant.findMany({
      where: whereClause,
      include: {
        stand: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Export based on format
    switch (format) {
      case 'csv':
        return await exportCSV(participants, event, res)
      case 'batch-json':
        return await exportBatchJSON(participants, event, includeImage === 'true', res)
      case 'json':
      default:
        return await exportJSON(participants, event, includeImage === 'true', res)
    }

  } catch (error) {
    console.error('Error exporting QR codes:', error)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Export single participant QR Code
 */
async function exportSingleQRCode(
  participantId: string,
  format: string,
  res: NextApiResponse
) {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      event: {
        select: { code: true, name: true }
      },
      stand: {
        select: { code: true, name: true }
      }
    }
  })

  if (!participant) {
    return res.status(404).json({ error: 'Participant not found' })
  }

  const qrPayload: QRPayload = {
    id: participant.id,
    name: participant.name,
    cpf: participant.cpf,
    event: participant.event?.code || participant.eventCode || '',
    stand: participant.stand?.code || '',
    standName: participant.stand?.name || '',
    ts: new Date().toISOString(),
    v: '1.0'
  }

  if (format === 'png') {
    const buffer = await QRCode.toBuffer(JSON.stringify(qrPayload), {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `attachment; filename="qr-${participant.name.replace(/\s/g, '_')}.png"`)
    return res.send(buffer)
  }

  if (format === 'svg') {
    const svg = await QRCode.toString(JSON.stringify(qrPayload), {
      type: 'svg',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    })

    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Content-Disposition', `attachment; filename="qr-${participant.name.replace(/\s/g, '_')}.svg"`)
    return res.send(svg)
  }

  // Default: return JSON with data URL
  const dataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M'
  })

  return res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf
    },
    qrPayload,
    qrCodeDataUrl: dataUrl
  })
}

/**
 * Export JSON with QR Code data
 */
async function exportJSON(
  participants: any[],
  event: any,
  includeImage: boolean,
  res: NextApiResponse
) {
  const results = await Promise.all(
    participants.map(async (p) => {
      const qrPayload: QRPayload = {
        id: p.id,
        name: p.name,
        cpf: p.cpf,
        event: event.code,
        stand: p.stand?.code || '',
        standName: p.stand?.name || '',
        ts: new Date().toISOString(),
        v: '1.0'
      }

      const result: any = {
        participant: {
          id: p.id,
          name: p.name,
          cpf: p.cpf,
          email: p.email,
          phone: p.phone,
          stand: p.stand?.name || p.stand?.code || ''
        },
        qrPayload
      }

      if (includeImage) {
        result.qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M'
        })
      }

      return result
    })
  )

  return res.json({
    event: {
      id: event.id,
      name: event.name,
      code: event.code
    },
    total: results.length,
    exportedAt: new Date().toISOString(),
    participants: results
  })
}

/**
 * Export batch JSON optimized for external software
 */
async function exportBatchJSON(
  participants: any[],
  event: any,
  includeImage: boolean,
  res: NextApiResponse
) {
  const results = await Promise.all(
    participants.map(async (p) => {
      // Compact QR payload for easier scanning
      const compactPayload = `MF|${p.id.substring(0, 8)}|${p.cpf.replace(/\D/g, '')}|${event.code}|${p.stand?.code || '-'}|${p.name.substring(0, 30)}`

      const result: any = {
        id: p.id,
        shortId: p.id.substring(0, 8).toUpperCase(),
        name: p.name,
        cpf: p.cpf,
        cpfNumeric: p.cpf.replace(/\D/g, ''),
        email: p.email || '',
        phone: p.phone || '',
        eventCode: event.code,
        standCode: p.stand?.code || '',
        standName: p.stand?.name || '',
        qrPayloadCompact: compactPayload,
        qrPayloadFull: JSON.stringify({
          id: p.id,
          name: p.name,
          cpf: p.cpf,
          event: event.code,
          stand: p.stand?.code || '',
          v: '1.0'
        })
      }

      if (includeImage) {
        result.qrCodeBase64 = await QRCode.toDataURL(compactPayload, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M'
        })
      }

      return result
    })
  )

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${event.code}-${new Date().toISOString().split('T')[0]}.json"`)

  return res.json({
    meta: {
      format: 'mega-feira-qr-export',
      version: '1.0',
      event: event.name,
      eventCode: event.code,
      total: results.length,
      exportedAt: new Date().toISOString(),
      qrFormat: {
        compact: 'MF|SHORT_ID|CPF|EVENT|STAND|NAME',
        full: 'JSON object with id, name, cpf, event, stand, v'
      }
    },
    participants: results
  })
}

/**
 * Export CSV with QR Code payloads
 */
async function exportCSV(
  participants: any[],
  event: any,
  res: NextApiResponse
) {
  const headers = [
    'ID',
    'Short ID',
    'Nome',
    'CPF',
    'Email',
    'Telefone',
    'Stand',
    'Stand Nome',
    'QR Payload (Compact)',
    'QR Payload (JSON)'
  ]

  const rows = participants.map(p => {
    const compactPayload = `MF|${p.id.substring(0, 8)}|${p.cpf.replace(/\D/g, '')}|${event.code}|${p.stand?.code || '-'}|${p.name.substring(0, 30)}`
    const fullPayload = JSON.stringify({
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      event: event.code,
      stand: p.stand?.code || '',
      v: '1.0'
    })

    return [
      p.id,
      p.id.substring(0, 8).toUpperCase(),
      `"${p.name.replace(/"/g, '""')}"`,
      p.cpf,
      p.email || '',
      p.phone || '',
      p.stand?.code || '',
      `"${(p.stand?.name || '').replace(/"/g, '""')}"`,
      `"${compactPayload}"`,
      `"${fullPayload.replace(/"/g, '""')}"`
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${event.code}-${new Date().toISOString().split('T')[0]}.csv"`)

  // Add BOM for Excel UTF-8 compatibility
  return res.send('\ufeff' + csv)
}

// Increase payload size limit for base64 images
export const config = {
  api: {
    responseLimit: '50mb'
  }
}
