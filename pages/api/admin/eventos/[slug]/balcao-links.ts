/**
 * /api/admin/eventos/[slug]/balcao-links
 *
 *   GET     → links do evento (sem token) + últimas trocas de foto feitas no balcão
 *   POST    { label }  → gera um link; o link em claro volta SÓ nesta resposta
 *   DELETE  { id }     → revoga na hora (vale na próxima chamada do operador)
 *
 * `canManageAdmins`: dar acesso a uma pessoa de fora é o mesmo tipo de ato que
 * dar acesso ao painel. A Leise tem essa permissão desde 04/09 — permissões só
 * são lidas no login (JWT de 24h), então escolher uma que ela ainda não tivesse
 * faria a tela parecer quebrada até o próximo login.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { gerarLinkBalcao, revogarLinkBalcao, linkDoBalcao } from '../../../../../lib/balcao/acesso'
import { getClientIp } from '../../../../../lib/rate-limit'

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  res.setHeader('Cache-Control', 'private, no-store')
  const slug = String(req.query.slug ?? '')
  const evento = await prisma.event.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, endDate: true } })
  if (!evento) return res.status(404).json({ error: 'Evento não encontrado' })
  if (!hasEventPermission(session, evento.id, 'canManageAdmins') && !hasEventPermission(session, evento.slug, 'canManageAdmins')) {
    return res.status(403).json({ error: 'Sem permissão para gerenciar o balcão deste evento' })
  }

  const ator = {
    adminId: (session.user as any)?.id ?? null,
    adminEmail: session.user?.email ?? 'admin-desconhecido',
    ip: getClientIp(req),
    userAgent: (req.headers['user-agent'] as string) ?? null
  }

  if (req.method === 'GET') {
    const [links, trocas] = await Promise.all([
      prisma.balcaoAccessToken.findMany({
        where: { eventId: evento.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, createdAt: true, createdByEmail: true, expiresAt: true, revokedAt: true, revokedBy: true, lastUsedAt: true }
      }),
      prisma.auditLog.findMany({
        where: { eventId: evento.id, action: 'BALCAO_FOTO_TROCADA' },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, createdAt: true, description: true, metadata: true, targetParticipantId: true }
      })
    ])
    const agora = new Date()
    return res.status(200).json({
      evento: { name: evento.name, endDate: evento.endDate },
      links: links.map((l) => ({ ...l, ativo: !l.revokedAt && l.expiresAt > agora })),
      trocas: trocas.map((t) => ({
        id: t.id,
        em: t.createdAt,
        descricao: t.description,
        operador: (t.metadata as any)?.operador ?? null
      }))
    })
  }

  if (req.method === 'POST') {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 80) : ''
    if (label.length < 3) {
      return res.status(400).json({ error: 'Dê um nome ao link (quem vai operar), com pelo menos 3 letras.' })
    }
    const { id, token, expiresAt } = await gerarLinkBalcao(evento.id, label, ator)
    return res.status(201).json({ id, label, link: linkDoBalcao(token), expiresAt })
  }

  if (req.method === 'DELETE') {
    const id = typeof req.body?.id === 'string' ? req.body.id : ''
    const ok = id ? await revogarLinkBalcao(id, evento.id, ator) : false
    if (!ok) return res.status(404).json({ error: 'Link não encontrado' })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
