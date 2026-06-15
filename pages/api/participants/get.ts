import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { rateLimitOrReject } from '../../../lib/rate-limit'
import { validateEditToken, touchEditToken, maskCpf } from '../../../lib/participant-edit/validate'

/**
 * GET /api/participants/get?token=<editToken>
 *
 * Carrega os dados do cadastro para o formulário de edição self-service.
 * O participantId vem EXCLUSIVAMENTE do token validado no servidor — o
 * parâmetro `id` não é mais aceito (fecha o buraco original). Retorna apenas
 * o select mínimo que o formulário usa; nada de foto, documentos, status de
 * aprovação ou flags internas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!rateLimitOrReject(req, res, 'participants-get', 30, 10 * 60 * 1000)) {
    return
  }

  try {
    const { token } = req.query

    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Token de edição obrigatório' })
    }

    const access = await validateEditToken(token)
    if (!access) {
      return res.status(401).json({ error: 'Link de edição inválido ou expirado' })
    }

    await touchEditToken(access.tokenId)

    // customData filtrado pelas chaves dos campos do formulário (CustomField
    // ativos do evento ou globais) — evita trafegar chaves internas
    const fields = await prisma.customField.findMany({
      where: {
        active: true,
        OR: [{ eventId: access.participant.eventId }, { eventId: null }]
      },
      select: { fieldName: true }
    })
    const formKeys = new Set(fields.map((f) => f.fieldName))
    const rawCustom = (access.participant.customData as Record<string, unknown>) || {}
    const customData: Record<string, unknown> = {}
    for (const k of Object.keys(rawCustom)) {
      if (formKeys.has(k)) customData[k] = rawCustom[k]
    }

    return res.status(200).json({
      success: true,
      participant: {
        name: access.participant.name,
        email: access.participant.email || '',
        phone: access.participant.phone || '',
        cpfMasked: maskCpf(access.participant.cpf),
        eventSlug: access.event.slug || '',
        eventCode: access.event.code || access.participant.eventCode || '',
        standCode: access.standCode || '',
        customData
      }
    })
  } catch (error) {
    console.error('Error fetching participant (edit):', error)
    return res.status(500).json({ error: 'Internal server error', message: 'Erro ao buscar cadastro' })
  }
}
