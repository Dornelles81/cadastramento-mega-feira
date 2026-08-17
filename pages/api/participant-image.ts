import { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../lib/prisma'
import { withApiAuth, OPERATOR_ROLES, hasEventPermission } from '../../lib/api-auth'
import { getFaceImageDataUrl } from '../../lib/face-image'

/**
 * Retorna a foto facial de um participante (decriptada) para usuários
 * autenticados (admins e operadores de portaria).
 *
 * GET /api/participant-image?id=<participantId>
 * Resposta: { imageUrl: string, type: 'url' } | placeholder SVG
 *
 * Escopo: só o papel não basta. Admin de evento só enxerga a foto de quem
 * pertence a um evento ao qual ele tem acesso — antes, qualquer admin de
 * qualquer evento baixava a biometria de qualquer participante do sistema
 * sabendo só o UUID. SUPER_ADMIN e OPERATOR (portaria, que precisa conferir
 * o rosto de quem chega no portão) seguem com acesso amplo.
 */
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid participant ID' })
    }

    const participant = await prisma.participant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        faceImageUrl: true,
        faceData: true,
        status: true,
        isDeleted: true,
        eventId: true,
        event: { select: { slug: true } }
      }
    })

    // Excluído pelo gestor do stand ('removed') ou purgado LGPD (isDeleted):
    // este endpoint deixa de existir para ele. 404 igual ao de id inexistente,
    // de propósito — um 403 vazaria que o cadastro existe, e cair no placeholder
    // de iniciais (abaixo) vazaria o NOME de quem foi excluído.
    //
    // Este é o controle real: vale para qualquer chamador. Pular o fetch na UI
    // é só otimização, não pode ser a proteção.
    if (!participant || participant.status === 'removed' || participant.isDeleted) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // ESCOPO DE EVENTO: mesma régua do resto do /admin (hasEventPermission,
    // 'canView'). Fora do escopo responde 404, não 403 — 403 confirmaria a
    // existência do cadastro para quem só chutou um UUID.
    // Participante legado sem evento não tem escopo verificável: só o acesso
    // amplo alcança.
    const role = (session.user as any)?.role as string | undefined
    const acessoAmplo = role === 'SUPER_ADMIN' || role === 'OPERATOR'
    if (!acessoAmplo) {
      const escopo = participant.event?.slug ?? participant.eventId
      const podeVer = escopo ? hasEventPermission(session, escopo, 'canView') : false
      if (!podeVer) {
        return res.status(404).json({ error: 'Participant not found' })
      }
    }

    const imageUrl = getFaceImageDataUrl(participant)

    if (imageUrl) {
      // Imagem é dado biométrico: nunca cachear em proxies/compartilhado
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).json({ imageUrl, type: 'url' })
    }

    // Sem imagem: placeholder com as iniciais
    const initials = participant.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e5e7eb"/><text x="60" y="72" font-family="sans-serif" font-size="40" fill="#6b7280" text-anchor="middle">${initials}</text></svg>`
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    return res.status(200).json({ imageUrl: dataUrl, type: 'placeholder' })
  } catch (error) {
    console.error('Error fetching participant image:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withApiAuth(handler, { roles: OPERATOR_ROLES })
