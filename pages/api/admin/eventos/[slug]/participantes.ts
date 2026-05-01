import { NextApiRequest, NextApiResponse } from 'next'
import { requireEventAccess, createAuditLog } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'


/**
 * API PROTEGIDA: Lista participantes de um evento específico
 *
 * Segurança:
 * - Requer autenticação (NextAuth session)
 * - Requer permissão 'canView' para o evento
 * - Filtra APENAS participantes do evento solicitado
 * - Registra acesso nos logs de auditoria
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { slug } = req.query

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug do evento é obrigatório' })
    }

    // ========================================================================
    // SEGURANÇA: Verificar autenticação + permissão para o evento
    // ========================================================================
    const { session, event, admin } = await requireEventAccess(
      req,
      res,
      slug,
      'canView' // Requer permissão de visualização
    )

    // ========================================================================
    // QUERY: Buscar APENAS participantes deste evento (com paginação)
    // ========================================================================
    const page = parseInt(req.query.page as string || '1', 10)
    const limit = Math.min(parseInt(req.query.limit as string || '200', 10), 500)
    const skip = (page - 1) * limit

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where: {
          eventId: event.id, // ← ISOLAMENTO GARANTIDO
          isDeleted: false
        },
        select: {
          id: true, name: true, cpf: true, email: true, phone: true,
          createdAt: true, approvalStatus: true, approvedAt: true,
          hikCentralSyncStatus: true, credentialNumber: true,
          credentialPrinted: true, credentialPrintedAt: true,
          checkedIn: true, checkedInAt: true, customData: true,
          standId: true, stand: true, eventId: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.participant.count({ where: { eventId: event.id, isDeleted: false } })
    ])

    // ========================================================================
    // AUDIT LOG: Registrar acesso aos dados
    // ========================================================================
    await createAuditLog({
      adminId: admin.id,
      eventId: event.id,
      action: 'VIEW_PARTICIPANTS',
      entityType: 'participant',
      description: `Admin ${admin.name} visualizou participantes do evento ${event.name} (página ${page})`,
      metadata: { count: participants.length, total, page, eventSlug: slug },
      severity: 'INFO'
    })

    // ========================================================================
    // RESPONSE: Retornar dados
    // ========================================================================
    return res.status(200).json({
      success: true,
      event: { id: event.id, slug: event.slug, name: event.name, code: event.code },
      participants,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      admin: { name: admin.name, role: admin.role }
    })
  } catch (error: any) {
    console.error('Error in /api/admin/eventos/[slug]/participantes:', error)

    // Return appropriate error message
    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    if (error.message.startsWith('Sem permissão')) {
      return res.status(403).json({ error: error.message })
    }

    if (error.message === 'Evento não encontrado') {
      return res.status(404).json({ error: 'Evento não encontrado' })
    }

    return res.status(500).json({ error: 'Erro ao buscar participantes' })
  }
}
