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
import { listAllocatedTerminalIds, resolveActiveAllocation } from '../terminals/allocation'

/**
 * Garante 1 linha de push pendente para o subject em CADA terminal ATIVO do
 * contexto. Idempotente: não duplica (upsert no unique), não re-empurra linha já
 * em push/synced (update vazio = no-op) e REVIVE linha que estava em remoção
 * (subject voltou a ser elegível). Pré-condição: identidade (`employeeNo`) já
 * atribuída — senão o `/work` pula a linha de qualquer forma.
 */
export async function enqueueForContext(contextId: string, participantId: string): Promise<void> {
  // ── ELEGIBILIDADE: a trava mora AQUI, não em cada chamador ────────────────
  // Esta função CRIA linha de push e REVIVE linha em remoção. As duas coisas
  // significam "esta pessoa deve estar no terminal" — afirmação que só pode ser
  // feita sobre quem é elegível AGORA.
  //
  // Antes, a checagem ficava a cargo de quem chamava, e bastava um caminho
  // esquecer para um removido voltar a ter acesso físico. Concretamente: o
  // `updateMany` de `enqueueFaceChange` filtra `removalState: 'none'`, então
  // para um removido ele conta 0 linhas; qualquer fallback do tipo "não achou
  // linha, então cria" cairia no revival abaixo e devolveria a pessoa aos
  // terminais. Somado ao token de edição, que não olhava status, isso era
  // ressuscitar sozinho com um link antigo.
  //
  // Checar aqui fecha a CLASSE inteira em vez de um caso: nenhum chamador,
  // presente ou futuro, consegue enfileirar ou reviver quem não é elegível.
  // `backfillTerminal` já fazia isso no próprio loop — aqui a regra vira única.
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      status: true, isDeleted: true, approvalStatus: true,
      faceData: true, faceImageUrl: true,
      event: { select: { requiresApprovalForAccess: true } }
    }
  })
  if (!p) return
  const requiresApproval = p.event?.requiresApprovalForAccess ?? true
  if (!isEligible(p, { requiresApproval })) return

  // ESCOPO por ALOCAÇÃO VIGENTE (não mais `Terminal.eventId`): só terminais que
  // atendem este evento AGORA. Fora do período, lista vazia → não enfileira.
  const terminalIds = await listAllocatedTerminalIds(contextId)
  if (terminalIds.length === 0) return

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
 * Re-captura de face (F5): a foto mudou → re-empurra face E card em TODOS os
 * terminais (o agente apaga+recria o usuário, então o card precisa voltar junto).
 * Só linhas em push (removalState='none'). Imediato; o reconcile também pegaria
 * pela divergência de `faceVersion`, mas isto evita esperar o ciclo de 60s.
 */
export async function enqueueFaceChange(participantId: string): Promise<void> {
  await prisma.participantTerminalSync.updateMany({
    where: { participantId, removalState: 'none' },
    data: {
      faceState: 'pending',
      cardState: 'pending',
      // Foto NOVA é uma tentativa legítima, então ganha contador novo: sem
      // isto, uma linha que esgotou o teto com a foto ANTIGA continuaria
      // barrada no `/work` mesmo depois da re-captura que a consertaria — e o
      // teto passaria a punir justamente a ação que resolve o problema.
      // Mesma regra do `faceTrocada` em `reconcile.ts`.
      attempts: 0,
      lastError: null
    }
  })
}

/**
 * ESVAZIAR um terminal: marca remoção pendente em TODAS as linhas dele. É a
 * simétrica de `backfillTerminal` — até existir, o sistema sabia encher um
 * terminal numa chamada e não sabia esvaziar.
 *
 * ── Por que precisa ser explícita, e não automática ────────────────────────
 * `reconcileTerminal` recusa reconciliar sem alocação vigente exatamente para
 * que um terminal cuja feira acabou NÃO se esvazie sozinho (uma feira que
 * estende um dia esvaziaria a catraca na virada). Essa trava está certa e
 * continua de pé: esta função não é chamada por nenhuma varredura, só pelo
 * endpoint de admin, com confirmação por nome e registro em auditoria.
 *
 * ── Escopo das linhas ──────────────────────────────────────────────────────
 * TODAS as linhas do terminal que ainda não estão `removed`, inclusive as que
 * nunca chegaram a ser empurradas. Parece exagero e não é: `applyRemoval` trata
 * "usuário não existe no device" como SUCESSO (agent/apply.ts), então drenar
 * uma linha nunca sincronizada custa uma chamada e devolve `removed` — que é a
 * afirmação correta ("esta pessoa não está neste terminal"). O contrário, filtrar
 * por `faceState='synced'`, deixaria de fora exatamente as linhas cujo estado
 * real no device é duvidoso, que são as que mais interessam numa limpeza LGPD.
 *
 * `attempts`/`lastError` são zerados porque a remoção é uma operação NOVA e
 * diferente do push que porventura falhou antes: uma linha que esgotou o teto
 * tentando gravar a face não pode carregar esse contador para a remoção, senão
 * a limpeza nasce barrada pelo teto do `/work`.
 *
 * Devolve quantas linhas foram marcadas — o número vai para o audit log, e é
 * ele que permite conferir depois se a limpeza fechou.
 */
export async function drainTerminal(terminalId: string): Promise<number> {
  const r = await prisma.participantTerminalSync.updateMany({
    where: { terminalId, removalState: { not: 'removed' } },
    data: { removalState: 'pending', attempts: 0, lastError: null }
  })
  return r.count
}

/**
 * Backfill ao cadastrar/ativar um terminal: cria linha de push para todo o
 * roster ELEGÍVEL do contexto que ainda não tem linha nesse terminal. Não
 * duplica (upsert). No-op se o terminal estiver inativo.
 */
export async function backfillTerminal(terminalId: string): Promise<void> {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { isActive: true }
  })
  if (!terminal || !terminal.isActive) return

  // ESCOPO por ALOCAÇÃO VIGENTE: o evento vem da alocação, não da coluna
  // deprecada. Terminal cadastrado sem alocação (ou fora do período) não faz
  // backfill de ninguém.
  const scope = await resolveActiveAllocation(terminalId)
  if (!scope.ok) return

  const roster = await prisma.participant.findMany({
    where: { eventId: scope.allocation.eventId, isDeleted: false, employeeNo: { not: null } },
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
