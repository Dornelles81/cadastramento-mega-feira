/**
 * Tokens de acesso delegado por stand (SPEC-acesso-por-stand.md + ADENDO).
 *
 * O token em claro tem 32 bytes aleatórios em base64url e existe apenas no
 * momento da geração (vai no e-mail ao responsável). No banco fica somente o
 * hash SHA-256. Apenas um token ativo por stand: gerar um novo revoga os
 * anteriores na mesma transação.
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../prisma'

export interface StandTokenActor {
  /** Id do admin autenticado (EventAdmin.id) */
  adminId?: string | null
  /** E-mail do admin autenticado — vai para o audit log */
  adminEmail: string
  ip?: string | null
  userAgent?: string | null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function buildStandLink(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://cadastramento-mega-feira.vercel.app'
  return `${base.replace(/\/$/, '')}/stand/${token}`
}

/**
 * Gera um novo token para o stand, revogando os anteriores, e registra
 * TOKEN_GENERATED no audit log. Retorna o token em claro (única vez que
 * ele existe fora do e-mail) e a data de expiração aplicada.
 */
export async function generateStandAccessToken(
  standId: string,
  actor: StandTokenActor
): Promise<{ token: string; expiresAt: Date | null }> {
  const stand = await prisma.stand.findUnique({
    where: { id: standId },
    include: { event: { select: { id: true, endDate: true } } }
  })
  if (!stand) throw new Error('Stand não encontrado')

  const token = randomBytes(32).toString('base64url')
  // Default da SPEC: expira no fim do evento (NULL = sem expiração)
  const expiresAt = stand.event?.endDate ?? null

  await prisma.$transaction([
    prisma.standAccessToken.updateMany({
      where: { standId, revokedAt: null },
      data: { revokedAt: new Date() }
    }),
    prisma.standAccessToken.create({
      data: {
        standId,
        tokenHash: hashToken(token),
        createdBy: actor.adminId ?? null,
        expiresAt
      }
    }),
    prisma.auditLog.create({
      data: {
        eventId: stand.event?.id ?? stand.eventId,
        standId,
        action: 'TOKEN_GENERATED',
        entityType: 'stand',
        entityId: standId,
        actorType: 'admin',
        actorIdentifier: actor.adminEmail,
        adminEmail: actor.adminEmail,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        description: `Link de acesso gerado para o stand ${stand.code}`,
        severity: 'INFO'
      }
    })
  ])

  return { token, expiresAt }
}

/**
 * Revoga todos os tokens ativos do stand e registra TOKEN_REVOKED.
 * Retorna quantos tokens foram revogados.
 */
export async function revokeStandAccessTokens(
  standId: string,
  actor: StandTokenActor
): Promise<number> {
  const stand = await prisma.stand.findUnique({
    where: { id: standId },
    select: { id: true, code: true, eventId: true }
  })
  if (!stand) throw new Error('Stand não encontrado')

  const [revoked] = await prisma.$transaction([
    prisma.standAccessToken.updateMany({
      where: { standId, revokedAt: null },
      data: { revokedAt: new Date() }
    }),
    prisma.auditLog.create({
      data: {
        eventId: stand.eventId,
        standId,
        action: 'TOKEN_REVOKED',
        entityType: 'stand',
        entityId: standId,
        actorType: 'admin',
        actorIdentifier: actor.adminEmail,
        adminEmail: actor.adminEmail,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        description: `Link de acesso revogado para o stand ${stand.code}`,
        severity: 'INFO'
      }
    })
  ])

  return revoked.count
}
