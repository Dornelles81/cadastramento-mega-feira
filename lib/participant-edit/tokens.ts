/**
 * Tokens de edição self-service por participante (Grupo D).
 *
 * Espelha lib/stand-access/tokens.ts: token de 32 bytes aleatórios em
 * base64url, existe em claro apenas na geração (vai no link enviado ao
 * participante). No banco fica só o hash SHA-256. Um token ativo por
 * participante: gerar um novo revoga os anteriores na mesma transação
 * (mesma razão do stand — um link vivo por vez reduz superfície e confusão).
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../prisma'

const DAY_MS = 24 * 60 * 60 * 1000
const MARGIN_DAYS = 7 // fim do evento + 7 dias
const FLOOR_DAYS = 7 // piso: pelo menos 7 dias (cobre evento já encerrado)
const CAP_DAYS = 30 // teto de segurança: nunca mais que 30 dias

export interface EditTokenActor {
  adminId?: string | null
  adminEmail: string
  ip?: string | null
  userAgent?: string | null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function buildEditLink(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://cadastramento-mega-feira.vercel.app'
  return `${base.replace(/\/$/, '')}/editar/${token}`
}

/** Expiração: fim do evento + 7d, piso now+7d, teto now+30d. */
export function computeEditExpiry(eventEndDate: Date | null, now: Date = new Date()): Date {
  const floor = now.getTime() + FLOOR_DAYS * DAY_MS
  const cap = now.getTime() + CAP_DAYS * DAY_MS
  const base = eventEndDate ? eventEndDate.getTime() + MARGIN_DAYS * DAY_MS : floor
  return new Date(Math.min(Math.max(base, floor), cap))
}

/**
 * Gera um novo token de edição para o participante, revogando os anteriores
 * ativos, e registra EDIT_LINK_GENERATED na auditoria. Retorna o token em
 * claro (única vez que ele existe) e a expiração aplicada.
 */
export async function generateParticipantEditToken(
  participantId: string,
  actor: EditTokenActor
): Promise<{ token: string; expiresAt: Date }> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, eventId: true, event: { select: { id: true, endDate: true } } }
  })
  if (!participant) throw new Error('Participante não encontrado')

  const token = randomBytes(32).toString('base64url')
  const expiresAt = computeEditExpiry(participant.event?.endDate ?? null)

  await prisma.$transaction([
    prisma.participantEditToken.updateMany({
      where: { participantId, revokedAt: null },
      data: { revokedAt: new Date() }
    }),
    prisma.participantEditToken.create({
      data: {
        participantId,
        tokenHash: hashToken(token),
        createdBy: actor.adminId ?? null,
        expiresAt
      }
    }),
    prisma.auditLog.create({
      data: {
        eventId: participant.event?.id ?? participant.eventId,
        action: 'EDIT_LINK_GENERATED',
        entityType: 'participant',
        entityId: participantId,
        actorType: 'admin',
        actorIdentifier: actor.adminEmail,
        adminEmail: actor.adminEmail,
        targetParticipantId: participantId,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        description: 'Link de edição self-service gerado para o participante',
        severity: 'INFO'
      }
    })
  ])

  return { token, expiresAt }
}
