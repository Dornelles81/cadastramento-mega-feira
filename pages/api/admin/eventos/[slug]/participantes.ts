import { NextApiRequest, NextApiResponse } from 'next'
import { requireEventAccess, createAuditLog } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { tryGetFaceImageDataUrl } from '../../../../../lib/face-image'


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

    // Filtro opcional por status de aprovação: SÓ aplica se o parâmetro vier.
    // Sem ele, retorna todos (comportamento preservado p/ callers que veem tudo,
    // ex.: gestão/aprovação). A tela de credenciais manda approvalStatus=approved
    // no modo "Somente aprovados" → passa a receber só os aprovados.
    const approvalStatus =
      typeof req.query.approvalStatus === 'string' ? req.query.approvalStatus : undefined
    // whereBase = universo desta tela SEM o recorte de stand. As contagens por stand são
    // calculadas sobre ele: filtrar por um stand não pode zerar a contagem dos outros.
    const whereBase: any = { eventId: event.id, isDeleted: false } // ← ISOLAMENTO GARANTIDO
    if (approvalStatus) whereBase.approvalStatus = approvalStatus

    // Filtro por stand. 'none' = participantes sem stand (standId é nullable no schema);
    // ausente = sem recorte. Coberto por @@index([standId]) em Participant.
    const standIdParam = typeof req.query.standId === 'string' ? req.query.standId : undefined
    const where: any = { ...whereBase }
    if (standIdParam === 'none') where.standId = null
    else if (standIdParam) where.standId = standIdParam

    // Ordenação: a tela de credenciais pede 'name' para o maço de etiquetas sair em ordem
    // alfabética. Default segue createdAt desc (comportamento anterior).
    const ordenacao =
      req.query.orderBy === 'name'
        ? ({ name: 'asc' } as const)
        : ({ createdAt: 'desc' } as const)

    // Foto é OPT-IN: o dado biométrico só sai daqui quando o caller diz que precisa dele.
    // Os templates de etiqueta não têm foto — mandar a face decriptada para eles era o maior
    // item do payload, à toa. Chamador único hoje: a tela de credenciais.
    const includePhoto = req.query.includePhoto === 'true'

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        select: {
          id: true, name: true, cpf: true, email: true, phone: true,
          createdAt: true, approvalStatus: true, approvedAt: true,
          hikCentralSyncStatus: true, credentialNumber: true,
          credentialPrinted: true, credentialPrintedAt: true,
          checkedIn: true, checkedInAt: true, customData: true,
          standId: true, eventId: true,
          // Select explícito: `stand: true` mandava a linha inteira do stand em cada
          // participante — inclusive responsibleEmail/responsiblePhone, contato do
          // responsável trafegando sem uso. Estes 5 campos são os que o client declara.
          stand: { select: { id: true, name: true, code: true, category: true, hall: true } },
          ...(includePhoto ? { faceImageUrl: true, faceData: true } : {})
        },
        orderBy: ordenacao,
        take: limit,
        skip
      }),
      prisma.participant.count({ where })
    ])

    // Contagens por stand para o dropdown — groupBy sobre o UNIVERSO (whereBase), nunca
    // sobre a amostra carregada. Stands sem ninguém sob o filtro atual não entram: não há
    // o que imprimir neles.
    let standCounts: { id: string; name: string; code: string; count: number }[] | undefined
    let semStandCount: number | undefined
    if (req.query.includeStandCounts === 'true') {
      const grupos = await prisma.participant.groupBy({
        by: ['standId'],
        where: whereBase,
        _count: { _all: true }
      })
      const porId = new Map<string, number>()
      semStandCount = 0
      for (const g of grupos) {
        if (g.standId) porId.set(g.standId, g._count._all)
        else semStandCount += g._count._all
      }
      const stands = porId.size
        ? await prisma.stand.findMany({
            where: { id: { in: Array.from(porId.keys()) } },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' }
          })
        : []
      standCounts = stands.map(s => ({ ...s, count: porId.get(s.id) ?? 0 }))
    }

    // ========================================================================
    // AUDIT LOG: Registrar acesso aos dados
    // ========================================================================
    await createAuditLog({
      adminId: admin.id,
      eventId: event.id,
      action: 'VIEW_PARTICIPANTS',
      entityType: 'participant',
      description: `Admin ${admin.name} visualizou participantes do evento ${event.name} (página ${page})`,
      metadata: { count: participants.length, total, page, eventSlug: slug, includePhoto },
      severity: 'INFO'
    })

    // ========================================================================
    // RESPONSE: Retornar dados
    // ========================================================================
    // Sem includePhoto o registro já sai sem face nenhuma (nem selecionada foi). Com ele,
    // decripta server-side e nunca envia o blob criptografado ao client.
    const participantsOut = includePhoto
      ? (participants as any[]).map(({ faceData, ...p }) => ({
          ...p,
          faceImageUrl: tryGetFaceImageDataUrl(
            { faceData, faceImageUrl: p.faceImageUrl },
            { participantId: p.id, where: 'admin/eventos/[slug]/participantes' }
          )
        }))
      : participants

    return res.status(200).json({
      success: true,
      event: { id: event.id, slug: event.slug, name: event.name, code: event.code },
      participants: participantsOut,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      ...(standCounts ? { standCounts, semStandCount } : {}),
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
