import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'

/**
 * Auditoria no admin (SPEC seção 2.5 / Fase 6).
 *
 * GET /api/admin/audit-logs
 *   Filtros: action, standId, eventId, from, to (YYYY-MM-DD), severity
 *   Paginação: page (1-based), limit (default 100, máx 500)
 *   Exportação: format=csv aplica os mesmos filtros (máx 5000 linhas)
 *
 * A tabela é append-only: esta API é somente leitura.
 */

const CSV_MAX_ROWS = 5000

function buildWhere(q: NextApiRequest['query']) {
  const where: any = {}
  if (q.action && q.action !== 'all') where.action = q.action
  if (q.standId) where.standId = q.standId
  if (q.eventId) where.eventId = q.eventId
  if (q.severity) where.severity = q.severity
  if (q.from || q.to) {
    where.createdAt = {}
    if (q.from) where.createdAt.gte = new Date(`${q.from}T00:00:00-03:00`)
    if (q.to) where.createdAt.lte = new Date(`${q.to}T23:59:59.999-03:00`)
  }
  return where
}

const LOG_INCLUDE = {
  event: { select: { name: true, code: true, slug: true } },
  stand: { select: { name: true, code: true } },
  admin: { select: { name: true, email: true } }
} as const

function serializeLog(log: any) {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    actorType: log.actorType,
    actorIdentifier: log.actorIdentifier,
    adminUser: log.admin?.email || log.adminEmail || log.adminUser,
    adminName: log.admin?.name,
    adminIp: log.ip || log.adminIp,
    targetParticipantId: log.targetParticipantId,
    targetSnapshot: log.targetSnapshot,
    reason: log.reason,
    userAgent: log.userAgent,
    description: log.description,
    severity: log.severity,
    metadata: log.metadata,
    previousData: log.previousData,
    newData: log.newData,
    changes: log.changes,
    createdAt: log.createdAt,
    event: log.event,
    stand: log.stand
  }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(logs: any[]): string {
  const header = [
    'data_hora', 'acao', 'evento', 'stand', 'ator_tipo', 'ator',
    'alvo_nome', 'alvo_documento', 'motivo', 'ip', 'descricao', 'severidade'
  ]
  const rows = logs.map((l) =>
    [
      new Date(l.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      l.action,
      l.event?.name ?? '',
      l.stand ? `${l.stand.name} (${l.stand.code})` : '',
      l.actorType ?? (l.adminUser ? 'admin' : ''),
      l.actorIdentifier ?? l.adminUser ?? '',
      (l.targetSnapshot as any)?.name ?? '',
      (l.targetSnapshot as any)?.document ?? '',
      l.reason ?? '',
      l.adminIp ?? '',
      l.description ?? '',
      l.severity
    ].map(csvEscape).join(';')
  )
  // BOM para o Excel pt-BR abrir com acentuação correta; separador ;
  return '﻿' + [header.join(';'), ...rows].join('\r\n')
}

async function handler(req: NextApiRequest, res: NextApiResponse, _session: Session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const where = buildWhere(req.query)

  if (req.query.format === 'csv') {
    const logs = await prisma.auditLog.findMany({
      where,
      include: LOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: CSV_MAX_ROWS
    })
    const csv = toCsv(logs.map(serializeLog))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="auditoria_${new Date().toISOString().slice(0, 10)}.csv"`
    )
    return res.status(200).send(csv)
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10) || 100, 500)
  const page = Math.max(parseInt((req.query.page as string) || '1', 10) || 1, 1)

  const [logs, total, actionRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: LOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit
    }),
    prisma.auditLog.count({ where }),
    // Ações distintas para popular o filtro da UI
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true } })
  ])

  return res.status(200).json({
    success: true,
    logs: logs.map(serializeLog),
    total,
    page,
    limit,
    actions: actionRows.map((a) => a.action).sort()
  })
}

export default withApiAuth(
  async (req, res, session) => {
    try {
      await handler(req, res, session)
    } catch (error: any) {
      console.error('Audit logs API error:', error)
      res.status(500).json({ error: 'Internal server error', details: error.message })
    }
  },
  { roles: ADMIN_ROLES }
)
