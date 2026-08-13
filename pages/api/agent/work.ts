/**
 * GET /api/agent/work[?terminalId=&limit=]
 *
 * Trabalho pendente para o agente, escopado ao evento do token. É AQUI que a
 * face é DECRIPTADA na nuvem (server-side, única vez que a MASTER_KEY é tocada
 * neste fluxo): a resposta entrega a face já em claro (data URL base64), pronta
 * para o agente enviar ao terminal — o PC do evento nunca decripta nada.
 *
 * Fonte: linhas ParticipantTerminalSync com estado pendente. Itens de PUSH
 * (face/card) só são servidos se o participante ainda for elegível agora
 * (status/isDeleted/face/approval) — não entregamos a face de quem deixou de
 * ser elegível. Itens de REMOÇÃO são servidos independentemente.
 *
 * Read-only sobre o estado: a materialização das linhas (fan-out) é da Fase 2.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { getFaceImageDataUrl } from '../../../lib/face-image'
import { isEligible } from '../../../lib/agent/eligibility'
import { resolveValidity } from '../../../lib/agent/validity'
import { listAllocatedTerminalIds } from '../../../lib/terminals/allocation'
// Backoff por linha (F3): re-serve uma linha `failed` só depois de
// RETRY_BACKOFF_MS e enquanto attempts < MAX_ATTEMPTS — daí a reconciliação/
// operador assume. Constantes compartilhadas com a tela de saúde do sync, que
// precisa contar como "falha" exatamente o que aqui deixa de ser servido.
import { RETRY_BACKOFF_MS, MAX_ATTEMPTS } from '../../../lib/agent/retry-policy'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

async function handler(req: NextApiRequest, res: NextApiResponse, agent: AgentContext) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!agent.eventId) {
    return res.status(200).json({ push: [], removals: [] })
  }

  const terminalId = typeof req.query.terminalId === 'string' ? req.query.terminalId : undefined
  const limit = Math.min(
    Number(req.query.limit) || DEFAULT_LIMIT,
    MAX_LIMIT
  )

  // ESCOPO por ALOCAÇÃO VIGENTE (não mais `Terminal.eventId`): só terminais que
  // atendem o evento do token AGORA. Fora do período de alocação a lista é
  // vazia e o agente não recebe trabalho — que é o efeito pretendido, e o que o
  // vínculo sem período não conseguia produzir.
  const allocatedIds = await listAllocatedTerminalIds(agent.eventId)
  if (allocatedIds.length === 0) {
    return res.status(200).json({ push: [], removals: [] })
  }
  // Se um terminal específico foi pedido, ele precisa estar DENTRO do escopo —
  // nunca de outro evento, nunca fora do período.
  if (terminalId && !allocatedIds.includes(terminalId)) {
    return res.status(200).json({ push: [], removals: [] })
  }

  // Serve linhas pendentes E linhas `failed` que já passaram do backoff (retry
  // coerente por kind), com teto de tentativas.
  const retryCutoff = new Date(Date.now() - RETRY_BACKOFF_MS)
  const retriable = { attempts: { lt: MAX_ATTEMPTS }, lastAttemptAt: { lt: retryCutoff } }
  const rows = await prisma.participantTerminalSync.findMany({
    where: {
      terminalId: terminalId ? terminalId : { in: allocatedIds },
      OR: [
        { faceState: 'pending' },
        { cardState: 'pending' },
        { removalState: 'pending' },
        { faceState: 'failed', ...retriable },
        { cardState: 'failed', ...retriable },
        { removalState: 'failed', ...retriable }
      ]
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
    include: {
      participant: {
        select: {
          id: true,
          name: true,
          cpf: true,
          status: true,
          isDeleted: true,
          approvalStatus: true,
          faceData: true,
          faceImageUrl: true,
          cardNumber: true,
          employeeNo: true,
          faceVersion: true,
          event: { select: { requiresApprovalForAccess: true } }
        }
      }
    }
  })

  const push: any[] = []
  const removals: any[] = []

  for (const row of rows) {
    const p = row.participant
    const employeeNo = p.employeeNo // Fase 1: sequencial global, fonte da verdade

    // Sem employeeNo não há o que escrever/remover no device (a identidade é
    // atribuída antes do fan-out). Pula a linha — a reconciliação cuida do resto.
    if (!employeeNo) continue

    if (row.removalState === 'pending' || row.removalState === 'failed') {
      removals.push({ syncId: row.id, terminalId: row.terminalId, employeeNo })
      // Remoção e push são mutuamente exclusivos por linha.
      continue
    }

    // 'failed' também precisa de ação (retry); 'synced'/'na' não.
    const needFace = row.faceState === 'pending' || row.faceState === 'failed'
    const needCard = row.cardState === 'pending' || row.cardState === 'failed'
    if (!needFace && !needCard) continue

    const requiresApproval = p.event?.requiresApprovalForAccess ?? true
    if (!isEligible(p, { requiresApproval })) {
      // Não elegível agora: não servimos a face. A reconciliação (virar remoção)
      // é da Fase 2.
      continue
    }

    // Validade resolvida NA NUVEM (§6): o agente só aplica. Hoje = modo evento.
    const validity = resolveValidity()

    push.push({
      syncId: row.id,
      terminalId: row.terminalId,
      employeeNo,
      name: p.name,
      cardNumber: p.cardNumber,
      validBegin: validity.begin,
      validEnd: validity.end,
      faceVersion: p.faceVersion, // F5: o agente devolve no ack p/ gravar na linha
      needFace,
      needCard,
      // Face decriptada na nuvem; null se não for necessária nesta linha.
      face: needFace ? getFaceImageDataUrl(p) : null
    })
  }

  return res.status(200).json({ push, removals })
}

export default withAgentAuth(handler)
