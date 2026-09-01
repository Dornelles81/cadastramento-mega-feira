/**
 * POST /api/admin/participants/:id/reactivate
 *
 * Escape da organização: reativa qualquer removido, sem exigir o stand. Existe
 * porque durante a feira o responsável do stand vai estar inacessível em algum
 * momento, e a pessoa não pode ficar presa no balcão esperando.
 *
 * Mesmo núcleo do caminho do gestor (`lib/participants/reactivation`), então as
 * regras não divergem: `slotLockedUntil` continua respeitado — o escape é sobre
 * QUEM pode reativar, não sobre burlar a regra anti-rotatividade — e a cota só
 * volta dentro da janela do dia operacional.
 *
 * Também devolve um LINK DE EDIÇÃO quando a pessoa está sem foto: reativar
 * sozinho não a leva ao terminal, e o link é o caminho para a foto nova. Isso
 * fecha o atendimento de balcão numa ação só.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { withApiAuth, ADMIN_ROLES } from '../../../../../lib/api-auth'
import { reativarParticipante } from '../../../../../lib/participants/reactivation'
import { formatRelease } from '../../../../../lib/stand-access/occupancy'
import { generateParticipantEditToken, buildEditLink } from '../../../../../lib/participant-edit/tokens'

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID do participante é obrigatório' })
  }

  const email = (session.user as any)?.email ?? '(sessao-sem-email)'

  const r = await reativarParticipante({
    participantId: id,
    standIdEsperado: null, // admin alcança qualquer stand — é o ponto do escape
    ator: { tipo: 'admin', email },
    ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
    userAgent: (req.headers['user-agent'] as string) ?? null
  })

  if (!r.ok) {
    if (r.falha === 'nao-encontrado') {
      return res.status(404).json({ error: 'Participante não encontrado' })
    }
    if (r.falha === 'nao-removido') {
      return res.status(409).json({ error: 'Este participante não está removido' })
    }
    if (r.falha === 'vaga-travada') {
      return res.status(409).json({
        error: 'Vaga reservada',
        message:
          'Esta pessoa usou a credencial hoje; a vaga fica reservada até ' +
          `${formatRelease(r.liberaEm!)}.`
      })
    }
    if (r.falha === 'stand-cheio') {
      return res.status(409).json({
        error: 'Stand lotado',
        message: 'O stand está lotado. Libere uma vaga antes de reativar.'
      })
    }
  }

  // Sem foto → link de edição junto, para a pessoa resolver na hora. A geração
  // revoga tokens anteriores do participante (ver participant-edit/tokens).
  let linkEdicao: string | null = null
  if (r.participante && !r.participante.temFoto) {
    try {
      const { token } = await generateParticipantEditToken(id, {
        adminId: (session.user as any)?.id ?? null,
        adminEmail: email,
        ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
        userAgent: (req.headers['user-agent'] as string) ?? null
      })
      linkEdicao = buildEditLink(token)
    } catch (e: any) {
      // Não desfaz a reativação por causa do link: a pessoa já voltou à equipe,
      // e o link pode ser gerado de novo pelo botão que já existe na tela.
      console.error('reactivate: falha ao gerar link de edição:', e?.message)
    }
  }

  return res.status(200).json({
    success: true,
    participante: r.participante,
    cotaDevolvida: r.cotaDevolvida ?? false,
    precisaFoto: r.participante ? !r.participante.temFoto : true,
    linkEdicao,
    message: r.participante && !r.participante.temFoto
      ? `${r.participante.name} voltou para a equipe. Falta a foto nova para o acesso funcionar.`
      : `${r.participante?.name ?? 'Participante'} voltou para a equipe.`
  })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
