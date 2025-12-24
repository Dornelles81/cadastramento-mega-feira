import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * API: Get access logs with filtering and export
 *
 * GET /api/access/logs?eventId=xxx&type=ENTRY|EXIT&from=date&to=date&format=json|csv
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      eventId,
      eventCode,
      type,
      from,
      to,
      participantId,
      gate,
      limit = '100',
      offset = '0',
      format = 'json'
    } = req.query

    // Build where clause
    const where: any = {}

    // Event filter
    if (eventId || eventCode) {
      const event = await prisma.event.findFirst({
        where: eventId
          ? { id: eventId as string }
          : { code: eventCode as string }
      })

      if (event) {
        where.eventId = event.id
      }
    }

    // Type filter
    if (type && (type === 'ENTRY' || type === 'EXIT')) {
      where.type = type
    }

    // Date range filter
    if (from || to) {
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from as string)
      }
      if (to) {
        where.createdAt.lte = new Date(to as string)
      }
    }

    // Participant filter
    if (participantId) {
      where.participantId = participantId
    }

    // Gate filter
    if (gate) {
      where.gate = gate
    }

    // Get total count
    const totalCount = await prisma.accessLog.count({ where })

    // Get logs
    const logs = await prisma.accessLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        participant: {
          select: {
            id: true,
            name: true,
            cpf: true,
            email: true,
            phone: true,
            faceImageUrl: true,
            stand: {
              select: { code: true, name: true }
            }
          }
        },
        event: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    })

    // Export as CSV if requested
    if (format === 'csv') {
      const headers = [
        'Data/Hora',
        'Tipo',
        'Participante',
        'CPF',
        'Email',
        'Telefone',
        'Stand',
        'Portao',
        'Operador',
        'Metodo',
        'Evento'
      ]

      const rows = logs.map(log => [
        new Date(log.createdAt).toLocaleString('pt-BR'),
        log.type === 'ENTRY' ? 'Entrada' : 'Saida',
        `"${log.participant.name}"`,
        log.participant.cpf,
        log.participant.email || '',
        log.participant.phone || '',
        log.participant.stand?.name || log.participant.stand?.code || '',
        log.gate || '',
        log.operatorName || '',
        log.verificationMethod,
        log.event.name
      ].join(','))

      const csv = [headers.join(','), ...rows].join('\n')

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="access-logs-${new Date().toISOString().split('T')[0]}.csv"`)

      return res.send('\ufeff' + csv)
    }

    // Calculate summary stats
    const entriesCount = logs.filter(l => l.type === 'ENTRY').length
    const exitsCount = logs.filter(l => l.type === 'EXIT').length

    return res.status(200).json({
      success: true,
      total: totalCount,
      count: logs.length,
      offset: parseInt(offset as string),
      limit: parseInt(limit as string),
      summary: {
        entries: entriesCount,
        exits: exitsCount
      },
      logs: logs.map(log => ({
        id: log.id,
        type: log.type,
        time: log.createdAt,
        gate: log.gate,
        location: log.location,
        verificationMethod: log.verificationMethod,
        operator: {
          id: log.operatorId,
          name: log.operatorName,
          email: log.operatorEmail
        },
        participant: {
          id: log.participant.id,
          name: log.participant.name,
          cpf: log.participant.cpf,
          email: log.participant.email,
          phone: log.participant.phone,
          faceImageUrl: log.participant.faceImageUrl,
          stand: log.participant.stand?.name || log.participant.stand?.code
        },
        event: {
          id: log.event.id,
          name: log.event.name,
          code: log.event.code
        },
        notes: log.notes
      }))
    })

  } catch (error: any) {
    console.error('Access logs error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  } finally {
    await prisma.$disconnect()
  }
}
