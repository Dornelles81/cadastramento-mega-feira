import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../../../lib/api-auth'
import {
  generateStandAccessToken,
  revokeStandAccessTokens,
  buildStandLink
} from '../../../../../lib/stand-access/tokens'
import { sendStandAccessEmail } from '../../../../../lib/email/stand-access'

/**
 * POST   /api/admin/stands/:id/access-link  → gera token de um scope e retorna o link
 * DELETE /api/admin/stands/:id/access-link  → revoga o(s) link(s)
 *
 * Fatia 4: a geração é POR SCOPE ('register' | 'manage'). O token em claro é
 * retornado UMA vez na resposta (não é persistido em claro) para o admin
 * copiar/encaminhar por outro canal (ex.: WhatsApp). O envio por e-mail com os
 * dois links ciente de scope vem na Fatia 5; por ora o e-mail só é disparado
 * para o link de gestão ('manage'), cujo template atual é orientado ao responsável.
 */

// POST sem scope → 'manage' (semântica de hoje: o link único era o de gestão).
function parseScopeForPost(raw: unknown): 'register' | 'manage' | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === undefined || v === null || v === '') return 'manage'
  if (v === 'register' || v === 'manage') return v
  return null
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  const { id } = req.query
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Stand ID é obrigatório' })
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

  if (req.method === 'POST') {
    const scope = parseScopeForPost(req.body?.scope ?? req.query.scope)
    if (!scope) {
      return res.status(400).json({ error: "scope inválido — use 'register' ou 'manage'." })
    }

    const stand = await prisma.stand.findUnique({
      where: { id },
      include: { event: { select: { name: true } } }
    })
    if (!stand) {
      return res.status(404).json({ error: 'Stand não encontrado' })
    }

    const { token, expiresAt } = await generateStandAccessToken(id, actor, scope)
    const link = buildStandLink(token)

    // E-mail (Fatia 4): só para 'manage' e quando há e-mail do responsável —
    // o template atual é orientado à gestão. A Fatia 5 torna o e-mail ciente
    // de scope e envia os dois links. Para 'register' (ou sem e-mail), o link
    // em claro segue na resposta para o admin copiar/encaminhar.
    let sentTo: string | null = null
    if (scope === 'manage' && stand.responsibleEmail) {
      try {
        await sendStandAccessEmail({
          to: stand.responsibleEmail,
          responsibleName: stand.responsibleName,
          standName: stand.name,
          standCode: stand.code,
          eventName: stand.event?.name ?? 'Mega Feira',
          link,
          expiresAt
        })
        sentTo = stand.responsibleEmail
      } catch (emailError: any) {
        // Falha no e-mail: revoga só este scope para o admin tentar de novo
        await revokeStandAccessTokens(id, actor, scope)
        console.error('Erro ao enviar e-mail de acesso do stand:', emailError)
        return res.status(502).json({
          error: 'Token gerado, mas o envio do e-mail falhou. O token foi revogado — tente novamente.',
          details: emailError.message
        })
      }
    }

    // Token em claro retornado UMA vez (não persistido em claro).
    return res.status(200).json({
      success: true,
      scope,
      link,
      sentTo,
      expiresAt
    })
  }

  if (req.method === 'DELETE') {
    // scope opcional: ausente → revoga ambos os links; informado → só aquele
    const rawScope = req.body?.scope ?? req.query.scope
    let scope: 'register' | 'manage' | undefined
    if (rawScope !== undefined && rawScope !== null && rawScope !== '') {
      const v = Array.isArray(rawScope) ? rawScope[0] : rawScope
      if (v !== 'register' && v !== 'manage') {
        return res.status(400).json({ error: "scope inválido — use 'register' ou 'manage'." })
      }
      scope = v
    }

    const revoked = await revokeStandAccessTokens(id, actor, scope).catch((e: Error) => {
      if (e.message === 'Stand não encontrado') return null
      throw e
    })
    if (revoked === null) {
      return res.status(404).json({ error: 'Stand não encontrado' })
    }
    return res.status(200).json({ success: true, revoked, scope: scope ?? 'all' })
  }

  res.setHeader('Allow', 'POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(
  async (req, res, session) => {
    try {
      await handler(req, res, session)
    } catch (error: any) {
      console.error('Stand access-link API error:', error)
      res.status(500).json({ error: 'Internal server error', details: error.message })
    }
  },
  { roles: ADMIN_ROLES }
)
