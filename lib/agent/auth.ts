/**
 * Autenticação do AGENTE LOCAL (PC do evento) para os endpoints /api/agent/*.
 *
 * Espelha withApiAuth, mas em vez de sessão NextAuth usa um Bearer token
 * revogável (tabela AgentToken): Authorization: Bearer <token> → SHA-256 →
 * findUnique por tokenHash → timingSafeEqual → revokedAt/expiresAt → toca
 * lastUsedAt. O token é ESCOPADO POR EVENTO (AgentToken.eventId): o agente só
 * enxerga terminais e trabalho do evento do seu token.
 *
 * O PC do evento NUNCA recebe a connection string do banco nem a MASTER_KEY —
 * só este token, que faz exclusivamente as operações do agente e pode ser
 * revogado a qualquer momento (kill switch).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '../prisma'

// 32 bytes em base64url = 43 chars; margem para padding.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,48}$/

export interface AgentContext {
  tokenId: string
  /** Escopo do agente. Token sem evento não enxerga nenhum terminal. */
  eventId: string | null
  name: string
}

export type AgentHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  agent: AgentContext
) => unknown | Promise<unknown>

function extractBearer(req: NextApiRequest): string | null {
  const header = req.headers['authorization']
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export function withAgentAuth(handler: AgentHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const rawToken = extractBearer(req)
    if (!rawToken || !TOKEN_SHAPE.test(rawToken)) {
      return res.status(401).json({ error: 'Token de agente ausente ou inválido' })
    }

    const hash = createHash('sha256').update(rawToken).digest('hex')

    const tokenRow = await prisma.agentToken.findUnique({
      where: { tokenHash: hash }
    })
    if (!tokenRow) {
      return res.status(401).json({ error: 'Token de agente inválido' })
    }

    // Comparação em tempo constante, além do lookup por índice.
    const a = Buffer.from(hash, 'hex')
    const b = Buffer.from(tokenRow.tokenHash, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Token de agente inválido' })
    }

    if (tokenRow.revokedAt) {
      return res.status(401).json({ error: 'Token de agente revogado' })
    }
    if (tokenRow.expiresAt && tokenRow.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Token de agente expirado' })
    }

    // Telemetria: nunca derruba o fluxo.
    try {
      await prisma.agentToken.update({
        where: { id: tokenRow.id },
        data: { lastUsedAt: new Date() }
      })
    } catch (error) {
      console.error('withAgentAuth touch lastUsedAt error:', error)
    }

    return handler(req, res, {
      tokenId: tokenRow.id,
      eventId: tokenRow.eventId,
      name: tokenRow.name
    })
  }
}
