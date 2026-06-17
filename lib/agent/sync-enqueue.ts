/**
 * Fan-out do sync (Fase 2): materializa as linhas `ParticipantTerminalSync` que
 * o `/api/agent/work` serve. "Contexto + roster" (§6 do doc de arquitetura):
 * hoje o contexto é o `Event` e o roster são os `Participant` elegíveis; as
 * funções recebem ids e NÃO assumem o ciclo de vida de evento.
 *
 * Tudo idempotente (upsert/updateMany no `@@unique([participantId, terminalId])`)
 * e só sobre terminais ATIVOS. O agente nunca é tocado aqui — só o estado no DB.
 */
import { prisma } from '../prisma'
import { isEligible } from './eligibility'
import { assignIdentityIfEligible } from './identity'

/**
 * Garante 1 linha de push pendente para o subject em CADA terminal ATIVO do
 * contexto. Idempotente: não duplica (upsert no unique), não re-empurra linha já
 * em push/synced (update vazio = no-op) e REVIVE linha que estava em remoção
 * (subject voltou a ser elegível). Pré-condição: identidade (`employeeNo`) já
 * atribuída — senão o `/work` pula a linha de qualquer forma.
 */
export async function enqueueForContext(contextId: string, participantId: string): Promise<void> {
  const terminals = await prisma.terminal.findMany({
    where: { eventId: contextId, isActive: true },
    select: { id: true }
  })
  if (terminals.length === 0) return
  const terminalIds = terminals.map((t) => t.id)

  // 1) garante a existência da linha (concurrency-safe; não mexe no estado existente)
  for (const terminalId of terminalIds) {
    await prisma.participantTerminalSync.upsert({
      where: { participantId_terminalId: { participantId, terminalId } },
      create: { participantId, terminalId, faceState: 'pending', cardState: 'pending', removalState: 'none' },
      update: {}
    })
  }
  // 2) revive linhas que estavam em remoção (subject elegível de novo)
  await prisma.participantTerminalSync.updateMany({
    where: { participantId, terminalId: { in: terminalIds }, removalState: { not: 'none' } },
    data: { faceState: 'pending', cardState: 'pending', removalState: 'none', attempts: 0, lastError: null }
  })
}

/**
 * Marca remoção pendente em TODAS as linhas do subject. Idempotente. Para
 * remoções SOFT (`status='removed'` / `isDeleted`): o agente faz `deleteUser`.
 * NOTA: delete HARD do participante apaga as linhas (cascade) → a remoção do
 * device fica a cargo da reconciliação (F4).
 */
export async function enqueueRemoval(participantId: string): Promise<void> {
  await prisma.participantTerminalSync.updateMany({
    where: { participantId, removalState: { not: 'removed' } },
    data: { removalState: 'pending' }
  })
}

/**
 * Backfill ao cadastrar/ativar um terminal: cria linha de push para todo o
 * roster ELEGÍVEL do contexto que ainda não tem linha nesse terminal. Não
 * duplica (upsert). No-op se o terminal estiver inativo.
 */
export async function backfillTerminal(terminalId: string): Promise<void> {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { eventId: true, isActive: true }
  })
  if (!terminal || !terminal.isActive || !terminal.eventId) return

  const roster = await prisma.participant.findMany({
    where: { eventId: terminal.eventId, isDeleted: false, employeeNo: { not: null } },
    select: {
      id: true, status: true, isDeleted: true, approvalStatus: true,
      faceData: true, faceImageUrl: true,
      event: { select: { requiresApprovalForAccess: true } }
    }
  })
  for (const p of roster) {
    const requiresApproval = p.event?.requiresApprovalForAccess ?? true
    if (!isEligible(p, { requiresApproval })) continue
    await prisma.participantTerminalSync.upsert({
      where: { participantId_terminalId: { participantId: p.id, terminalId } },
      create: { participantId: p.id, terminalId, faceState: 'pending', cardState: 'pending', removalState: 'none' },
      update: {}
    })
  }
}

/**
 * Transição "ficou elegível" — aprovação OU registro em evento SEM-APROVAÇÃO.
 * Atribui a identidade (idempotente; só se elegível) e ENTÃO enfileira o fan-out,
 * garantindo a ordem identidade→enqueue num único lugar (o `/work` exige
 * `employeeNo`). Tornar não-fatal é responsabilidade do chamador (try/catch).
 */
export async function onBecameEligible(
  contextId: string | null | undefined,
  participantId: string
): Promise<void> {
  if (!contextId) return
  await assignIdentityIfEligible(participantId)
  await enqueueForContext(contextId, participantId)
}
