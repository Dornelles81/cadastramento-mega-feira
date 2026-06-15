import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../../../lib/api-auth'
import { generateParticipantEditToken, buildEditLink } from '../../../../../lib/participant-edit/tokens'

/**
 * POST /api/admin/participants/:id/edit-link
 *
 * Gera um link de edição self-service para o participante (prova de posse,
 * Grupo D). Espelho do /api/admin/stands/:id/access-link da Fase 2: grava só
 * o hash SHA-256, revoga o token ativo anterior, registra EDIT_LINK_GENERATED.
 *
 * O token em claro só aparece NESTA resposta (na URL) — nunca em listagens
 * ou outros endpoints (mesma garantia do link do stand).
 */
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'ID do participante é obrigatório' })
  }

  const participant = await prisma.participant.findUnique({
    where: { id },
    select: { id: true }
  })
  if (!participant) {
    return res.status(404).json({ error: 'Participante não encontrado' })
  }

  const actor = {
    adminId: (session.user as any).id ?? null,
    adminEmail: session.user?.email ?? 'admin-desconhecido',
    ip:
      ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() ||
      req.socket.remoteAddress ||
      null,
    userAgent: (req.headers['user-agent'] as string) ?? null
  }

  const { token, expiresAt } = await generateParticipantEditToken(id, actor)

  return res.status(200).json({
    success: true,
    url: buildEditLink(token),
    expiresAt
  })
}

export default withApiAuth(
  async (req, res, session) => {
    try {
      await handler(req, res, session)
    } catch (error: any) {
      console.error('Edit-link API error:', error)
      res.status(500).json({ error: 'Internal server error', details: error.message })
    }
  },
  { roles: ADMIN_ROLES }
)
