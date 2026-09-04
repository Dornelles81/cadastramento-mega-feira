import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
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
 * copiar/encaminhar por outro canal (ex.: WhatsApp).
 *
 * Sub-fatia 4.1: o envio por e-mail é OPT-IN — a geração NUNCA emaila sozinha.
 * Passe { sendEmail: true } no POST para disparar o e-mail (hoje só para o link
 * de gestão 'manage', cujo template é o de gestão; a Fatia 5 torna o e-mail
 * ciente de scope e habilita outros canais). Sem sendEmail, só gera e retorna
 * o link. Como o banco guarda apenas o hash, o e-mail é enviado no mesmo passo
 * da geração (o link em claro só existe nesse instante).
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

  // ── VÍNCULO DE EVENTO ──────────────────────────────────────────────────────
  // A rota tinha role (ADMIN_ROLES) mas nenhum escopo: um admin de um evento
  // gerava e revogava link de stand de QUALQUER outro. E não é link inócuo — o
  // de gestão entrega a lista de credenciados, com foto e CPF, e o botão de
  // excluir, a quem o receber. Gerar também REVOGA o anterior (só há um ativo
  // por scope), então dava para derrubar o acesso da equipe de um evento alheio
  // sem nenhum aviso.
  //
  // A permissão é `canManageStands` — a mesma do CRUD de stand, porque o link é
  // uma propriedade do stand. Escolha deliberada também pelo lado da operação:
  // é uma permissão que quem já administra stands POSSUI HOJE, então nenhuma
  // sessão em curso é derrubada por esta trava. Exigir `canDelete` (defensável,
  // já que o link de gestão exclui) romperia sessões vivas, porque essa
  // permission acabou de ser concedida e o JWT tem validade de 24h — a trava só
  // valeria depois do próximo login, e até lá pareceria bug.
  //
  // A busca fica ANTES das duas ramificações de propósito: o DELETE não
  // carregava o stand (quem resolvia era o `revokeStandAccessTokens`, lá dentro,
  // devolvendo 404 por comparação de string de erro). Agora as duas ramificações
  // partem do mesmo fato já verificado.
  const standAlvo = await prisma.stand.findUnique({
    where: { id },
    select: { id: true, event: { select: { slug: true } } }
  })
  if (!standAlvo) {
    return res.status(404).json({ error: 'Stand não encontrado' })
  }
  // `Stand.eventId` é nullable no schema (0 órfãos hoje, mas o tipo permite).
  // O slug sentinela nunca casa com vínculo nenhum: SUPER_ADMIN passa — a função
  // devolve true antes de olhar eventos — e qualquer outra role é recusada, que
  // é o lado seguro para um stand sem dono.
  if (!hasEventPermission(session, standAlvo.event?.slug ?? '__stand_sem_evento__', 'canManageStands')) {
    return res.status(403).json({
      error: 'Sem permissão para gerenciar os links de acesso deste stand'
    })
  }

  if (req.method === 'POST') {
    const scope = parseScopeForPost(req.body?.scope ?? req.query.scope)
    if (!scope) {
      return res.status(400).json({ error: "scope inválido — use 'register' ou 'manage'." })
    }

    // Envio de e-mail é OPT-IN (Sub-fatia 4.1): a geração nunca emaila sozinha.
    const sendEmail = req.body?.sendEmail === true

    const stand = await prisma.stand.findUnique({
      where: { id },
      include: { event: { select: { name: true } } }
    })
    if (!stand) {
      return res.status(404).json({ error: 'Stand não encontrado' })
    }

    // Validações do envio ANTES de gerar, para não criar token à toa quando o
    // e-mail pedido não pode ser entregue.
    if (sendEmail && scope !== 'manage') {
      return res.status(400).json({
        error: 'Envio por e-mail disponível apenas para o link de gestão (cadastro: Fatia 5).'
      })
    }
    if (sendEmail && !stand.responsibleEmail) {
      return res.status(400).json({
        error: 'Stand sem e-mail de responsável. Cadastre o e-mail antes de enviar.'
      })
    }

    const { token, expiresAt } = await generateStandAccessToken(id, actor, scope)
    const link = buildStandLink(token)

    // E-mail só quando explicitamente pedido (sendEmail=true). O template atual
    // é o de gestão; a Fatia 5 o torna ciente de scope / outros canais.
    let sentTo: string | null = null
    if (sendEmail) {
      try {
        await sendStandAccessEmail({
          to: stand.responsibleEmail!,
          responsibleName: stand.responsibleName,
          standName: stand.name,
          standCode: stand.code,
          eventName: stand.event?.name ?? 'Mega Feira',
          link,
          expiresAt
        })
        sentTo = stand.responsibleEmail!
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
