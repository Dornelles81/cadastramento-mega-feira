/**
 * Geração e revogação de tokens do agente local (AgentToken).
 *
 * Mesmo padrão dos tokens de stand/edição: 32 bytes aleatórios em base64url,
 * existe em claro APENAS na geração (vai para o PC do evento uma única vez). No
 * banco fica só o hash SHA-256. Escopo por evento (eventId) e kill switch via
 * revokedAt.
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../prisma'

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface AgentTokenActor {
  adminId?: string | null
  adminEmail?: string | null
}

/**
 * Cria um token de agente para um evento. Retorna o token em claro (única vez
 * que ele existe) e o id da linha. Registra TOKEN_GERADO na auditoria.
 */
export async function generateAgentToken(
  params: { eventId: string; name: string; expiresAt?: Date | null },
  actor: AgentTokenActor = {}
): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')

  const row = await prisma.agentToken.create({
    data: {
      eventId: params.eventId,
      name: params.name,
      tokenHash: hashAgentToken(token),
      createdBy: actor.adminId ?? actor.adminEmail ?? null,
      expiresAt: params.expiresAt ?? null
    }
  })

  try {
    await prisma.auditLog.create({
      data: {
        eventId: params.eventId,
        action: 'TOKEN_GERADO',
        entityType: 'agent_token',
        entityId: row.id,
        actorType: 'admin',
        actorIdentifier: actor.adminEmail ?? actor.adminId ?? null,
        adminId: actor.adminId ?? null,
        adminEmail: actor.adminEmail ?? null,
        description: `Token de agente "${params.name}" gerado para o evento`,
        severity: 'WARNING'
      }
    })
  } catch (error) {
    console.error('generateAgentToken audit error:', error)
  }

  return { id: row.id, token }
}

/** Revoga um token (kill switch). Idempotente. Registra TOKEN_REVOGADO. */
export async function revokeAgentToken(
  id: string,
  actor: AgentTokenActor = {}
): Promise<void> {
  const row = await prisma.agentToken.findUnique({ where: { id } })
  if (!row || row.revokedAt) return

  await prisma.agentToken.update({
    where: { id },
    data: { revokedAt: new Date() }
  })

  try {
    await prisma.auditLog.create({
      data: {
        eventId: row.eventId,
        action: 'TOKEN_REVOGADO',
        entityType: 'agent_token',
        entityId: id,
        actorType: 'admin',
        actorIdentifier: actor.adminEmail ?? actor.adminId ?? null,
        adminId: actor.adminId ?? null,
        adminEmail: actor.adminEmail ?? null,
        description: `Token de agente "${row.name}" revogado`,
        severity: 'WARNING'
      }
    })
  } catch (error) {
    console.error('revokeAgentToken audit error:', error)
  }
}
