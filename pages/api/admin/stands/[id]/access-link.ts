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
 * POST   /api/admin/stands/:id/access-link  → gera token e envia e-mail ao responsável
 * DELETE /api/admin/stands/:id/access-link  → revoga o token ativo
 *
 * O token em claro nunca é retornado na resposta — ele existe apenas no
 * e-mail enviado ao responsável (SPEC seção 2.1).
 */
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
    const stand = await prisma.stand.findUnique({
      where: { id },
      include: { event: { select: { name: true } } }
    })
    if (!stand) {
      return res.status(404).json({ error: 'Stand não encontrado' })
    }
    if (!stand.responsibleEmail) {
      return res.status(400).json({
        error: 'Stand sem e-mail de responsável. Cadastre o e-mail antes de gerar o link.'
      })
    }

    const { token, expiresAt } = await generateStandAccessToken(id, actor)

    try {
      await sendStandAccessEmail({
        to: stand.responsibleEmail,
        responsibleName: stand.responsibleName,
        standName: stand.name,
        standCode: stand.code,
        eventName: stand.event?.name ?? 'Mega Feira',
        link: buildStandLink(token),
        expiresAt
      })
    } catch (emailError: any) {
      // Sem e-mail entregue o link não chega a ninguém: revoga o token recém
      // criado para o admin poder simplesmente tentar de novo
      await revokeStandAccessTokens(id, actor)
      console.error('Erro ao enviar e-mail de acesso do stand:', emailError)
      return res.status(502).json({
        error: 'Token gerado, mas o envio do e-mail falhou. O token foi revogado — tente novamente.',
        details: emailError.message
      })
    }

    return res.status(200).json({
      success: true,
      sentTo: stand.responsibleEmail,
      expiresAt
    })
  }

  if (req.method === 'DELETE') {
    const revoked = await revokeStandAccessTokens(id, actor).catch((e: Error) => {
      if (e.message === 'Stand não encontrado') return null
      throw e
    })
    if (revoked === null) {
      return res.status(404).json({ error: 'Stand não encontrado' })
    }
    return res.status(200).json({ success: true, revoked })
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
