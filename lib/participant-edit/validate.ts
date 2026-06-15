/**
 * Validação server-side do token de edição self-service (Grupo D).
 *
 * Espelha lib/stand-access/validate.ts. Nunca confiar em nada vindo do
 * client: o participantId usado por get/update deriva EXCLUSIVAMENTE do token
 * validado aqui — o `id` do body/query é ignorado. Fecha o buraco original
 * (qualquer um com o UUID lia/editava o cadastro).
 */
import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '../prisma'

// 32 bytes em base64url = 43 chars; margem para variações de padding
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,48}$/

export interface ValidEditAccess {
  tokenId: string
  participant: {
    id: string
    name: string
    cpf: string
    email: string | null
    phone: string | null
    eventId: string | null
    eventCode: string | null
    customData: unknown
  }
  event: {
    id: string | null
    name: string
    code: string | null
    slug: string | null
    endDate: Date | null
  }
  standCode: string | null
}

/**
 * Valida o token bruto. Retorna o contexto do participante ou null
 * (inválido / revogado / expirado) — o chamador responde 404/401 genérico.
 */
export async function validateEditToken(rawToken: string): Promise<ValidEditAccess | null> {
  if (!TOKEN_SHAPE.test(rawToken)) return null

  const hash = createHash('sha256').update(rawToken).digest('hex')

  const tokenRow = await prisma.participantEditToken.findUnique({
    where: { tokenHash: hash },
    include: {
      participant: {
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          phone: true,
          eventId: true,
          eventCode: true,
          customData: true,
          event: { select: { id: true, name: true, code: true, slug: true, endDate: true } },
          stand: { select: { code: true } }
        }
      }
    }
  })
  if (!tokenRow) return null

  // Comparação em tempo constante, além do lookup por índice
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(tokenRow.tokenHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  if (tokenRow.revokedAt) return null
  if (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) return null

  const p = tokenRow.participant
  return {
    tokenId: tokenRow.id,
    participant: {
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      email: p.email,
      phone: p.phone,
      eventId: p.eventId,
      eventCode: p.eventCode,
      customData: p.customData
    },
    event: {
      id: p.event?.id ?? null,
      name: p.event?.name ?? 'Mega Feira',
      code: p.event?.code ?? null,
      slug: p.event?.slug ?? null,
      endDate: p.event?.endDate ?? null
    },
    standCode: p.stand?.code ?? null
  }
}

/** Atualiza lastUsedAt do token. Nunca lança (telemetria não derruba o fluxo). */
export async function touchEditToken(tokenId: string): Promise<void> {
  try {
    await prisma.participantEditToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date() }
    })
  } catch (error) {
    console.error('touchEditToken error:', error)
  }
}

/**
 * Registra PARTICIPANT_SELF_UPDATE na auditoria, com throttle de no máximo
 * 1 log por participante por hora. Nunca lança.
 */
export async function auditSelfUpdate(
  access: ValidEditAccess,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await prisma.auditLog.findFirst({
      where: {
        action: 'PARTICIPANT_SELF_UPDATE',
        entityId: access.participant.id,
        createdAt: { gte: oneHourAgo }
      },
      select: { id: true }
    })
    if (recent) return

    await prisma.auditLog.create({
      data: {
        eventId: access.event.id,
        action: 'PARTICIPANT_SELF_UPDATE',
        entityType: 'participant',
        entityId: access.participant.id,
        actorType: 'participant',
        actorIdentifier: null, // auto-atendimento via link; sem identidade individual
        targetParticipantId: access.participant.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        description: 'Cadastro atualizado pelo próprio participante via link de edição',
        severity: 'INFO'
      }
    })
  } catch (error) {
    console.error('auditSelfUpdate error:', error)
  }
}

/** Mascara CPF: 123.***.***-44. */
export function maskCpf(doc: string): string {
  const digits = (doc || '').replace(/\D/g, '')
  if (digits.length !== 11) return doc ? `***${doc.slice(-2)}` : ''
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`
}
