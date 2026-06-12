/**
 * Validação server-side do token de acesso do stand (SPEC seção 2.2).
 *
 * Nunca confiar em nada vindo do client: o standId usado em todas as
 * queries do painel deriva exclusivamente do token validado aqui.
 */
import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '../prisma'

// 32 bytes em base64url = 43 chars; aceita margem para variações de padding
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,48}$/

export interface ValidStandAccess {
  tokenId: string
  stand: {
    id: string
    name: string
    code: string
    location: string | null
    maxRegistrations: number
  }
  event: {
    id: string | null
    name: string
    code: string | null
    slug: string | null
    endDate: Date | null
  }
}

/**
 * Valida o token bruto vindo da URL. Retorna os dados do stand ou null
 * (inválido, revogado ou expirado — o chamador responde 404 genérico,
 * sem revelar se o stand existe).
 */
export async function validateStandToken(rawToken: string): Promise<ValidStandAccess | null> {
  if (!TOKEN_SHAPE.test(rawToken)) return null

  const hash = createHash('sha256').update(rawToken).digest('hex')

  const tokenRow = await prisma.standAccessToken.findUnique({
    where: { tokenHash: hash },
    include: {
      stand: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true,
          maxRegistrations: true,
          event: { select: { id: true, name: true, code: true, slug: true, endDate: true } }
        }
      }
    }
  })
  if (!tokenRow) return null

  // Comparação em tempo constante (SPEC seção 3), além do lookup por índice
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(tokenRow.tokenHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  if (tokenRow.revokedAt) return null
  if (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) return null

  return {
    tokenId: tokenRow.id,
    stand: {
      id: tokenRow.stand.id,
      name: tokenRow.stand.name,
      code: tokenRow.stand.code,
      location: tokenRow.stand.location,
      maxRegistrations: tokenRow.stand.maxRegistrations
    },
    event: {
      id: tokenRow.stand.event?.id ?? null,
      name: tokenRow.stand.event?.name ?? 'Mega Feira',
      code: tokenRow.stand.event?.code ?? null,
      slug: tokenRow.stand.event?.slug ?? null,
      endDate: tokenRow.stand.event?.endDate ?? null
    }
  }
}

/**
 * Atualiza lastUsedAt e registra PANEL_ACCESS na auditoria, com throttle de
 * no máximo 1 log por stand por hora para não inundar a auditoria (SPEC 2.2).
 * Nunca lança: falha de telemetria não pode derrubar o painel.
 */
export async function registerPanelAccess(
  access: ValidStandAccess,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<void> {
  try {
    await prisma.standAccessToken.update({
      where: { id: access.tokenId },
      data: { lastUsedAt: new Date() }
    })

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await prisma.auditLog.findFirst({
      where: {
        standId: access.stand.id,
        action: 'PANEL_ACCESS',
        createdAt: { gte: oneHourAgo }
      },
      select: { id: true }
    })
    if (recent) return

    await prisma.auditLog.create({
      data: {
        eventId: access.event.id,
        standId: access.stand.id,
        action: 'PANEL_ACCESS',
        entityType: 'stand',
        entityId: access.stand.id,
        actorType: 'stand_responsible',
        actorIdentifier: null, // o link é compartilhável; não há identidade individual
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        description: `Painel do stand ${access.stand.code} acessado via link`,
        severity: 'INFO'
      }
    })
  } catch (error) {
    console.error('registerPanelAccess error:', error)
  }
}

/** Mascara CPF/documento: 123.***.***-44 (SPEC 2.2). */
export function maskDocument(doc: string): string {
  const digits = doc.replace(/\D/g, '')
  if (digits.length !== 11) {
    // documento não-CPF: mantém só os 2 últimos caracteres visíveis
    return doc.length > 2 ? `${'*'.repeat(doc.length - 2)}${doc.slice(-2)}` : '**'
  }
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`
}
