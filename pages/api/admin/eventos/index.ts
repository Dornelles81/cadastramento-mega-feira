import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth, isSuperAdmin } from '../../../../lib/auth'
import { prisma } from '../../../../lib/prisma'
import { visibleParticipantsRelationWhere } from '../../../../lib/participants/visibility'


/**
 * API: Listar eventos visíveis para quem está logado.
 *
 * Segurança:
 * - Requer autenticação
 * - SUPER_ADMIN e OPERATOR (portaria/scanner): todos os eventos ativos
 * - Demais admins: SOMENTE os eventos com acesso ativo em EventAdminAccess,
 *   com as permissões reais daquele vínculo (nunca o all-true do super)
 * - Retorna a contagem VIVA de participantes — o dashboard usava o número do
 *   JWT, congelado no login por 24h, que não descia depois de uma exclusão
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    // Require authentication
    const session = await requireAuth(req, res)

    // SUPER_ADMIN e OPERATOR (o scanner da portaria precisa da lista) veem tudo.
    // Admin comum entra aqui também — mas SÓ enxerga os eventos onde tem vínculo
    // ativo, filtrado no banco (nunca por filtro no client).
    const isOperator = session?.user?.role === 'OPERATOR'
    const veTodosOsEventos = isSuperAdmin(session) || isOperator
    const adminId = session?.user?.id as string | undefined

    if (!veTodosOsEventos && !adminId) {
      return res.status(403).json({ error: 'Acesso negado.' })
    }

    // Permissões reais por evento para o admin comum (o super segue com all-true)
    const vinculos = veTodosOsEventos
      ? []
      : await prisma.eventAdminAccess.findMany({
          where: { adminId, isActive: true },
          select: {
            eventId: true,
            canView: true,
            canEdit: true,
            canApprove: true,
            canDelete: true,
            canExport: true,
            canManageStands: true,
            canManageAdmins: true,
            canRegisterAtDesk: true
          }
        })
    const permissoesPorEvento = new Map(
      vinculos.map(({ eventId, ...permissions }) => [eventId, permissions])
    )

    // Fetch all events with participant count
    const events = await prisma.event.findMany({
      where: {
        isActive: true,
        ...(veTodosOsEventos
          ? {}
          : { id: { in: [...permissoesPorEvento.keys()] } })
      },
      include: {
        _count: {
          select: {
            // "Cadastrados" do card = quem está cadastrado AGORA. Excluídos pelo
            // gestor do stand (status='removed') e purgados LGPD (isDeleted) não
            // contam — senão o número nunca desce depois de uma exclusão.
            participants: { where: visibleParticipantsRelationWhere() },
            stands: true,
            admins: true
          }
        },
        eventConfigs: {
          select: {
            logoUrl: true,
            primaryColor: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Map events to include permissions for super admin
    const eventsWithPermissions = events.map(event => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
      code: event.code,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      isActive: event.isActive,
      maxCapacity: event.maxCapacity,
      currentCount: event.currentCount,
      logoUrl: event.eventConfigs?.logoUrl,
      primaryColor: event.eventConfigs?.primaryColor,
      _count: event._count,
      permissions: permissoesPorEvento.get(event.id) ?? {
        canView: true,
        canEdit: true,
        canApprove: true,
        canDelete: true,
        canExport: true,
        canManageStands: true,
        canManageAdmins: true,
        canRegisterAtDesk: true
      }
    }))

    return res.status(200).json({
      success: true,
      events: eventsWithPermissions,
      total: events.length
    })
  } catch (error: any) {
    console.error('Error in /api/admin/eventos:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({ error: 'Erro ao buscar eventos' })
  }
}
