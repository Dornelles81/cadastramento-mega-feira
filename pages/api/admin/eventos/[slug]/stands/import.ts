import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../../lib/api-auth'

interface StandImport {
  code: string
  name: string
  maxRegistrations: number
  description?: string
  location?: string
  responsibleName?: string
  responsibleEmail?: string
  responsiblePhone?: string
  isActive?: boolean
}

// Importação em massa de stands de um evento.
//
// ── AUTORIZAÇÃO ────────────────────────────────────────────────────────────
// Esta rota é a irmã de /api/admin/eventos/[slug]/stands e exigia apenas sessão
// (`getSession`, sem role e sem vínculo com o evento do slug). Sem a mesma régua
// do POST de lá, ela seria o DESVIO da trava: o que o POST unitário passou a
// recusar continuaria possível em lote, por aqui. Mesma permissão, portanto:
// criar stand é `canManageStands` no evento do slug.
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  console.log('📥 [IMPORT] Requisição recebida:', req.method, req.url)

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { slug } = req.query
  const { stands } = req.body as { stands: StandImport[] }

  console.log('📥 [IMPORT] Slug:', slug)
  console.log('📥 [IMPORT] Stands recebidos:', stands?.length || 0)

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'Slug do evento é obrigatório' })
    return
  }

  if (!stands || !Array.isArray(stands) || stands.length === 0) {
    res.status(400).json({ error: 'Lista de stands é obrigatória' })
    return
  }

  try {
    // Find event by slug
    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      res.status(404).json({ error: 'Evento não encontrado' })
      return
    }

    // Mesma régua do POST unitário. `hasEventPermission` devolve true p/ SUPER_ADMIN.
    if (!hasEventPermission(session, event.slug, 'canManageStands')) {
      res.status(403).json({ error: 'Sem permissão para gerenciar os stands deste evento' })
      return
    }

    let created = 0
    let updated = 0

    // Process each stand
    for (const standData of stands) {
      // Check if stand already exists
      const existingStand = await prisma.stand.findFirst({
        where: {
          eventId: event.id,
          code: standData.code
        }
      })

      if (existingStand) {
        // Update existing stand
        await prisma.stand.update({
          where: { id: existingStand.id },
          data: {
            name: standData.name,
            maxRegistrations: standData.maxRegistrations,
            description: standData.description || null,
            location: standData.location || null,
            responsibleName: standData.responsibleName || null,
            responsibleEmail: standData.responsibleEmail || null,
            responsiblePhone: standData.responsiblePhone || null,
            isActive: standData.isActive !== false
          }
        })
        updated++
      } else {
        // Create new stand
        await prisma.stand.create({
          data: {
            code: standData.code,
            name: standData.name,
            maxRegistrations: standData.maxRegistrations,
            description: standData.description || null,
            location: standData.location || null,
            responsibleName: standData.responsibleName || null,
            responsibleEmail: standData.responsibleEmail || null,
            responsiblePhone: standData.responsiblePhone || null,
            isActive: standData.isActive !== false,
            eventId: event.id,
            eventCode: event.code
          }
        })
        created++
      }
    }

    console.log('📥 [IMPORT] ✅ Sucesso:', { created, updated, total: stands.length })
    res.status(200).json({
      success: true,
      created,
      updated,
      total: stands.length
    })

  } catch (error: any) {
    console.error('📥 [IMPORT] ❌ Erro:', error)
    res.status(500).json({
      error: 'Erro ao importar stands',
      message: error.message
    })
  }
}

// 401 sem sessão, 403 fora de ADMIN_ROLES (SUPER_ADMIN, ADMIN, EVENT_ADMIN).
export default withApiAuth(handler, { roles: ADMIN_ROLES })
