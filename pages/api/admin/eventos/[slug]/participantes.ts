import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireEventAccess, createAuditLog } from '../../../../../lib/auth'

const prisma = new PrismaClient()

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
    // QUERY: Buscar APENAS participantes deste evento
    // ========================================================================
    const participants = await prisma.participant.findMany({
      where: {
        eventId: event.id, // ← ISOLAMENTO GARANTIDO
        isDeleted: false
      },
      include: {
        stand: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // ========================================================================
    // AUDIT LOG: Registrar acesso aos dados
    // ========================================================================
    await createAuditLog({
      adminId: admin.id,
      eventId: event.id,
      action: 'VIEW_PARTICIPANTS',
      entityType: 'participant',
      description: `Admin ${admin.name} visualizou ${participants.length} participantes do evento ${event.name}`,
      metadata: {
        count: participants.length,
        eventSlug: slug
      },
      severity: 'INFO'
    })

    // ========================================================================
    // RESPONSE: Retornar dados
    // ========================================================================
    return res.status(200).json({
      success: true,
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        code: event.code
      },
      participants: participants.map(p => ({
        ...p,
        // Remove dados sensíveis se necessário
        faceData: undefined
      })),
      total: participants.length,
      admin: {
        name: admin.name,
        role: admin.role
      }
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
