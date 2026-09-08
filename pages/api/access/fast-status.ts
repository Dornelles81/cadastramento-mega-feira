import { withApiAuth, OPERATOR_ROLES } from '../../../lib/api-auth';
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { montarBuscaPortaria, resolverDocumentoEstrangeiro } from '../../../lib/participants/documento'
import { tryGetFaceImageDataUrl } from '../../../lib/face-image'

/**
 * API: Fast participant status lookup
 * Optimized for speed - minimal data returned
 * IMPORTANT: Requires eventId - participants are segregated by event
 *
 * GET /api/access/fast-status?q=CPF_OR_ID&eventId=xxx
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { q, eventId } = req.query

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query (q) is required' })
    }

    // eventId is REQUIRED for segregation
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId is required - participants are segregated by event' })
    }

    // O despachante (11 digitos = CPF, 8 caracteres = id curto, resto = UUID)
    // vive em lib/participants/documento.ts. Estava copiado aqui e em
    // access/status/[id].ts; quando o documento estrangeiro entrar, a quarta
    // perna precisa aparecer nos dois — e esquecer um significa a pessoa nao
    // ser encontrada no portao, com ela esperando.
    const busca = montarBuscaPortaria(q)

    // Build where clause - ALWAYS filter by event
    const whereClause: any = { eventId, ...busca.where }

    // Single optimized query
    let participant = await prisma.participant.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        cpf: true,
        faceImageUrl: true,
        faceData: true, // decriptado server-side para a foto da portaria
        approvalStatus: true,
        eventId: true,
        stand: {
          select: { name: true, code: true }
        }
      }
    })

    // ── QUARTA PERNA: documento estrangeiro ─────────────────────────────────
    // O operador digita o numero solto ("AB1234567") — ele nao conhece o
    // prefixo "PP-AR:". As tres pernas acima nao acham isso, e o resultado seria
    // "nao encontrado", que no portao se le como "essa pessoa nao esta
    // cadastrada". So roda depois de as tres falharem.
    //
    // ⚠️ Ambiguidade NAO vira escolha. Se o mesmo numero existir em dois paises,
    // a resposta e 409 com a instrucao do que fazer — devolver o primeiro seria
    // liberar a pessoa errada.
    if (!participant) {
      const doc = await resolverDocumentoEstrangeiro(prisma as any, eventId, q)
      if (doc.tipo === 'ambiguo') {
        return res.status(409).json({
          error: 'ambiguous_document',
          message: doc.mensagem,
          opcoes: doc.opcoes
        })
      }
      if (doc.tipo === 'unico') {
        participant = await prisma.participant.findFirst({
          where: { eventId, cpf: doc.identidade },
          select: {
            id: true,
            name: true,
            cpf: true,
            faceImageUrl: true,
            faceData: true, // decriptado server-side para a foto da portaria
            approvalStatus: true,
            eventId: true,
            stand: {
              select: { name: true, code: true }
            }
          }
        })
      }
    }

    if (!participant) {
      return res.status(404).json({ error: 'Not found' })
    }

    // Get last access in single query
    const lastAccess = await prisma.accessLog.findFirst({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'desc' },
      select: { type: true, createdAt: true }
    })

    const isInside = lastAccess?.type === 'ENTRY'
    const isApproved = participant.approvalStatus === 'approved'

    return res.status(200).json({
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf,
      photo: tryGetFaceImageDataUrl(participant, { participantId: participant.id, where: 'access/fast-status' }),
      stand: participant.stand?.name || participant.stand?.code,
      eventId: participant.eventId,
      status: participant.approvalStatus || 'pending',
      isApproved,
      isInside,
      canEnter: isApproved && !isInside,
      canExit: isInside,
      lastType: lastAccess?.type || null,
      lastTime: lastAccess?.createdAt || null
    })

  } catch (error: any) {
    console.error('Fast status error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withApiAuth(handler, { roles: OPERATOR_ROLES })
