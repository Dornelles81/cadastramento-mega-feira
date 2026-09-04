import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../lib/api-auth'
import { visibleParticipantsRelationWhere } from '../../../lib/participants/visibility'
import { buscarRemocoes, montarRemocao } from '../../../lib/participants/removal-badge'
import { tryGetFaceImageDataUrl } from '../../../lib/face-image'
import { deriveFaceStatus, isValidFace } from '../../../lib/face/status'
import { decryptDocuments } from '../../../lib/documents'

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  // CORS headers (restricted to same origin for authenticated endpoint)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  // Disable cache to ensure fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    // ========================================================================
    // EVENT FILTER + AUTORIZAÇÃO POR EVENTO
    // ========================================================================
    // Até 04/09/2026 este endpoint exigia APENAS sessão (`getSession`, sem role):
    // qualquer conta autenticada — inclusive o OPERATOR da portaria — lia nome,
    // CPF, telefone, os documentos DECIFRADOS e a BIOMETRIA de todos os
    // participantes de TODOS os eventos, bastando omitir o filtro. É o endpoint
    // que o painel realmente usa (app/admin/eventos/[slug]/page.tsx), então o
    // furo estava no caminho quente.
    //
    // Duas travas agora: ADMIN_ROLES no wrapper (o OPERATOR sai — o caminho dele
    // para conferir rosto na portaria é /api/participant-image, que já tem a sua
    // própria régua) e, dentro dela, vínculo de evento com `canView`.
    const { eventCode, eventId, includeRemoved } = req.query

    let whereClause: any = {}

    if (eventCode && typeof eventCode === 'string') {
      // Filter by event code
      whereClause.eventCode = eventCode
    } else if (eventId && typeof eventId === 'string') {
      // Filter by event ID
      whereClause.eventId = eventId
    }

    if (whereClause.eventCode || whereClause.eventId) {
      // Recorte pedido: resolve o evento e exige canView NELE.
      //
      // A resolução aceita `code` OU `slug` porque os dois formatos circulam: o
      // painel manda `eventId` quando o tem e cai em `eventCode=SLUG.toUpperCase()`
      // quando não tem. Isso casa com EXPOFEST-2026, mas o evento
      // `treinamento-credenciamento` tem code "Treinamento Credenciamento" — só
      // por `code` esse fallback viraria 404 onde antes trazia dados.
      const alvo = await prisma.event.findFirst({
        where: whereClause.eventId
          ? { id: whereClause.eventId }
          : {
              OR: [
                { code: whereClause.eventCode },
                { slug: (whereClause.eventCode as string).toLowerCase() }
              ]
            },
        select: { id: true, slug: true }
      })

      if (!alvo) {
        return res.status(404).json({ error: 'Evento não encontrado' })
      }

      // hasEventPermission casa por id OU slug e já devolve true para SUPER_ADMIN.
      const podeVer =
        hasEventPermission(session, alvo.id, 'canView') ||
        (!!alvo.slug && hasEventPermission(session, alvo.slug, 'canView'))

      if (!podeVer) {
        return res.status(403).json({
          error: 'Sem permissão para ver os participantes deste evento'
        })
      }
    } else if ((session.user as any)?.role !== 'SUPER_ADMIN') {
      // SEM recorte era o furo: devolvia todos os eventos. Em vez de recusar
      // (quebraria chamador legado que não manda filtro), restringe aos eventos
      // onde a conta tem canView. Sem nenhum, a lista sai vazia — falha fechado.
      const permitidos = (((session.user as any)?.events ?? []) as any[])
        .filter((e) => e?.permissions?.canView)
        .map((e) => e?.id)
        .filter(Boolean)
      whereClause.eventId = { in: permitidos }
    }

    // DEFAULT: esconde excluídos-pelo-dono (status='removed') e purgados LGPD
    // (isDeleted=true). Mantém pending/approved/rejected visíveis — approvalStatus
    // é independente de estar cadastrado ou não.
    //
    // Estado real dos chamadores (levantado em 2026-08-17): o único consumidor
    // versionado é app/admin/eventos/[slug]/page.tsx, que já pedia essa exclusão
    // explicitamente. Os fluxos de terminal/HikCentral NÃO passam por aqui — o
    // agente lê o banco direto (lib/agent/eligibility.ts, que aplica a mesma
    // régua status='active' AND !isDeleted). O comentário anterior dizia proteger
    // "telas de HikCentral" que já não existem desde a Fase 0.
    //
    // ?includeRemoved=1 restaura o comportamento antigo (sem filtro nenhum), para
    // a UI de "mostrar removidos" e para qualquer cliente externo não versionado.
    const mostrarRemovidos = includeRemoved === '1' || includeRemoved === 'true'
    if (!mostrarRemovidos) {
      Object.assign(whereClause, visibleParticipantsRelationWhere())
    }
    // DEPRECATED: ?excludeRemoved=1 virou o default e é aceito como no-op só para
    // não quebrar chamador antigo. Remover quando o call site parar de mandar.

    // ========================================================================
    // QUERY: Get participants with optional event filter
    // ========================================================================
    const participants = await prisma.participant.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        phone: true,
        eventCode: true,
        eventId: true,
        createdAt: true,
        // Estado de exclusão: alimenta o badge "Excluído pelo gestor" e é o que
        // explica ao admin por que aquele CPF continua bloqueado para recadastro
        status: true,
        removedAt: true,
        removedBy: true,
        consentAccepted: true,
        faceInterocularPx: true,
        faceImageUrl: true, // Foto legada (data URL em claro)
        faceData: true, // Foto nova (AES-256-GCM) — decriptada server-side abaixo, nunca enviada crua
        customData: true,
        documents: true, // Include documents field
        approvalStatus: true, // Include approval status
        approvedAt: true,
        approvedBy: true,
        rejectionReason: true,
        standId: true, // Stand ID
        stand: {
          select: {
            code: true,
            name: true
          }
        },
        event: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    console.log(`✅ Returning ${participants.length} participants`)

    // Ator da exclusão para o badge (audit log + fallback denormalizado)
    const exclusaoPorParticipante = await buscarRemocoes(
      participants.filter(p => p.status === 'removed').map(p => p.id)
    )

    // Format response
    const formattedParticipants = participants.map(participant => {
    // Removido pelo gestor: a exclusão já apagou biometria/documentos no banco
    // (SENSITIVE_PARTICIPANT_CLEAR). Zerar de novo aqui é cinto e suspensório —
    // linha antiga ou falha parcial na limpeza não vira foto exposta no painel.
    const removido = participant.status === 'removed'
    return {
      id: participant.id,
      name: participant.name,
      cpf: participant.cpf,
      email: participant.email || '',
      phone: participant.phone || '',
      eventCode: participant.eventCode || 'MEGA-FEIRA-2025',
      eventId: participant.eventId,
      eventName: participant.event?.name || '',
      eventSlug: participant.event?.slug || '',
      createdAt: participant.createdAt.toISOString(),
      consentAccepted: participant.consentAccepted,
      faceInterocularPx: participant.faceInterocularPx,
      faceStatus: deriveFaceStatus(participant.faceInterocularPx),
      hasValidFace: isValidFace(participant.faceInterocularPx),
      // [assim-mesmo] Captura sem validação (detector morto) — distingue de legado (null
      // sem a chave). Conferência operacional: badge no painel + filtro + coluna no export.
      faceUnvalidated: !!((participant.customData as any)?.__faceUnvalidated),
      // Tolerante: uma biometria corrompida vira card sem foto, não 500 na
      // listagem inteira. A falha sai no log com o participantId.
      faceImageUrl: removido
        ? ''
        : tryGetFaceImageDataUrl(participant, { participantId: participant.id, where: 'admin/participants-full' }) || '',
      customData: removido ? {} : participant.customData || {},
      documents: removido ? {} : decryptDocuments(participant.documents) || {}, // decifra server-side p/ o modal
      approvalStatus: participant.approvalStatus || 'pending',
      approvedAt: participant.approvedAt?.toISOString() || null,
      approvedBy: participant.approvedBy || null,
      rejectionReason: participant.rejectionReason || null,
      standCode: participant.stand?.code || null,
      standName: participant.stand?.name || null,
      // Estado de exclusão para o badge. `removal` só existe para removidos; o
      // ator vem do audit log, com removedAt/removedBy de fallback (legado).
      status: participant.status,
      removal: removido ? montarRemocao(participant, exclusaoPorParticipante) : null
    }
    })

    res.status(200).json({
      participants: formattedParticipants,
      total: formattedParticipants.length
    })

  } catch (error: any) {
    console.error('Admin participants query error:', error)

    res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao consultar participantes'
    })
  }
}

// 401 sem sessão, 403 fora de ADMIN_ROLES (SUPER_ADMIN, ADMIN, EVENT_ADMIN).
export default withApiAuth(handler, { roles: ADMIN_ROLES })
