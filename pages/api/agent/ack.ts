/**
 * POST /api/agent/ack
 *
 * Como o estado converge: o agente reporta o resultado por syncId/kind, e a
 * nuvem atualiza faceState/cardState/removalState, attempts++, lastAttemptAt e
 * lastError. A nuvem NUNCA fala com o device — só sabe o que aconteceu pelo ack.
 *
 * Body: { acks: [ { syncId, kind: 'face'|'card'|'removal',
 *                    status: 'success'|'failed', error?: string } ] }
 *
 * Cada ack é validado contra o escopo do token: a linha precisa pertencer a um
 * terminal do evento do token, senão é rejeitada (não confunde eventos).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { withAgentAuth, AgentContext } from '../../../lib/agent/auth'
import { hadAllocationToEvent } from '../../../lib/terminals/allocation'

type Kind = 'face' | 'card' | 'removal'

async function handler(req: NextApiRequest, res: NextApiResponse, agent: AgentContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!agent.eventId) {
    return res.status(403).json({ error: 'Token sem escopo de evento' })
  }

  const acks = Array.isArray(req.body?.acks) ? req.body.acks : null
  if (!acks) {
    return res.status(400).json({ error: 'Body inválido: esperado { acks: [...] }' })
  }

  const results: { syncId: string; kind: string; ok: boolean; reason?: string }[] = []
  const now = new Date()

  for (const ack of acks) {
    const { syncId, kind, status, error, faceVersion } = ack || {}
    if (
      typeof syncId !== 'string' ||
      !['face', 'card', 'removal'].includes(kind) ||
      !['success', 'failed'].includes(status)
    ) {
      results.push({ syncId: String(syncId), kind: String(kind), ok: false, reason: 'ack malformado' })
      continue
    }

    // Remoção vinda da fila que sobreviveu ao hard delete: o /work marca esses
    // itens com o prefixo `pdr:` porque eles NÃO vivem em
    // ParticipantTerminalSync — a linha de sync já foi apagada pelo cascade.
    // Confirmar na tabela errada deixaria a pendência aberta para sempre e o
    // rosto no device.
    if (syncId.startsWith('pdr:')) {
      const pdrId = syncId.slice(4)
      const pdr = await prisma.pendingDeviceRemoval.findUnique({
        where: { id: pdrId },
        select: { id: true, terminalId: true }
      })
      if (!pdr || !(await hadAllocationToEvent(pdr.terminalId, agent.eventId))) {
        results.push({ syncId, kind, ok: false, reason: 'fora do escopo do token' })
        continue
      }
      const okRemocao = status === 'success'
      await prisma.pendingDeviceRemoval.update({
        where: { id: pdr.id },
        data: {
          attempts: { increment: 1 },
          // `removedAt` é a PROVA de que a biometria saiu do device. Só é
          // gravado com confirmação do agente — nunca por otimismo.
          removedAt: okRemocao ? now : null,
          lastError: okRemocao ? null : (typeof error === 'string' ? error.slice(0, 1000) : 'erro não informado')
        }
      })
      results.push({ syncId, kind, ok: true })
      continue
    }

    // Escopo por ALOCAÇÃO — aqui DELIBERADAMENTE sem exigir período vigente.
    // O ack reporta trabalho que a nuvem JÁ despachou: se a alocação virar
    // entre o /work e o /ack (pega às 23:59, confirma às 00:01), recusar não
    // protege nada (o device já foi escrito) e ainda perderia a confirmação,
    // deixando a linha `pending` para sempre. Basta o terminal ter alocação
    // para o evento do token. Ver `hadAllocationToEvent`.
    const row = await prisma.participantTerminalSync.findFirst({
      where: { id: syncId },
      select: { id: true, terminalId: true }
    })
    if (!row || !(await hadAllocationToEvent(row.terminalId, agent.eventId))) {
      results.push({ syncId, kind, ok: false, reason: 'fora do escopo do token' })
      continue
    }

    const success = status === 'success'
    const data: any = {
      attempts: { increment: 1 },
      lastAttemptAt: now,
      lastError: success ? null : (typeof error === 'string' ? error.slice(0, 1000) : 'erro não informado')
    }

    if ((kind as Kind) === 'face') {
      data.faceState = success ? 'synced' : 'failed'
      if (success) {
        data.syncedAt = now
        // F5: registra a versão de face efetivamente sincronizada neste terminal
        // (o agente devolve a faceVersion que o /work mandou).
        if (typeof faceVersion === 'string') data.faceVersion = faceVersion
      }
    } else if ((kind as Kind) === 'card') {
      data.cardState = success ? 'synced' : 'failed'
      if (success) data.syncedAt = now
    } else {
      data.removalState = success ? 'removed' : 'failed'
      if (success) data.removedAt = now
    }

    await prisma.participantTerminalSync.update({ where: { id: syncId }, data })
    results.push({ syncId, kind, ok: true })
  }

  const applied = results.filter((r) => r.ok).length
  return res.status(200).json({ applied, total: results.length, results })
}

export default withAgentAuth(handler)
