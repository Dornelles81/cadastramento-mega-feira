/**
 * Reconciliação (F4): compara o ESTADO DESEJADO (banco, verdade) com o ESTADO
 * REAL de um terminal (reportado pelo agente) e enfileira correções em
 * `ParticipantTerminalSync`. NÃO fala com o device e NUNCA muda o banco pra bater
 * com o device — só o device é corrigido pra bater com o banco (via o agente).
 *
 * O agente passa o roster do device (paginado lá); aqui só decidimos.
 */
import { prisma } from '../prisma'
import { isEligible } from './eligibility'
import { resolveActiveAllocation } from '../terminals/allocation'
import { isExhausted } from './retry-policy'

export interface DeviceUser {
  employeeNo: string
  numOfFace: number
  numOfCard: number
}
export interface ReconcileResult {
  pushesEnqueued: number
  removalsEnqueued: number
  removeEmployeeNos: string[] // órfãos SEM linha de sync → o agente deleta direto
  /**
   * Preenchido quando a reconciliação foi PULADA por falta de alocação vigente.
   * Ver a trava anti-remoção-em-massa em `reconcileTerminal`.
   */
  skipped?: 'sem-alocacao-vigente'
}

/**
 * F5 — face TROCADA: a versão atual do participante difere da que foi
 * sincronizada NESTE terminal. Só dispara quando AMBAS as versões são conhecidas
 * e diferem (re-captura). row.faceVersion null = nunca sincronizou face (caso
 * inicial, tratado pelo numOfFace=0); participant.faceVersion null = legado.
 */
export function faceNeedsUpdate(
  participant: { faceVersion: string | null },
  row: { faceVersion: string | null } | undefined | null
): boolean {
  return !!participant.faceVersion && !!row?.faceVersion && participant.faceVersion !== row.faceVersion
}

export async function reconcileTerminal(
  terminalId: string,
  deviceUsers: DeviceUser[]
): Promise<ReconcileResult> {
  // ESCOPO por ALOCAÇÃO VIGENTE: o evento é derivado do terminal, não recebido
  // por parâmetro — quem decide "quais participantes este terminal deve ter" é
  // a alocação, e passar o eventId por fora permitiria reconciliar contra um
  // evento que não é o alocado.
  //
  // TRAVA CRÍTICA — SEM alocação vigente a reconciliação é NO-OP, nunca limpeza.
  // Se seguisse adiante, `desired` ficaria vazio e TODOS os usuários do device
  // virariam órfãos: um terminal cuja feira acabou seria esvaziado sozinho na
  // primeira reconciliação. Isso contraria a assimetria deliberada da expiração
  // (`lib/terminals/allocation`): expirar MARCA (`pendingCleanup`), a remoção
  // efetiva é ação explícita do admin.
  const scope = await resolveActiveAllocation(terminalId)
  if (!scope.ok) {
    return { pushesEnqueued: 0, removalsEnqueued: 0, removeEmployeeNos: [], skipped: 'sem-alocacao-vigente' }
  }
  const eventId = scope.allocation.eventId

  // ATUAL: map por employeeNo — STRING EXATA. Nunca coagir p/ número: perderia
  // zeros à esquerda ("00000010") e faria um elegível parecer órfão →
  // loop add↔remove. Este match estrito é a principal trava anti-loop.
  const actual = new Map<string, DeviceUser>()
  for (const u of deviceUsers) {
    if (u && typeof u.employeeNo === 'string') actual.set(u.employeeNo, u)
  }

  // DESEJADO: participantes ELEGÍVEIS do evento com employeeNo.
  const parts = await prisma.participant.findMany({
    where: { eventId, isDeleted: false, employeeNo: { not: null } },
    select: {
      id: true, employeeNo: true, cardNumber: true, status: true, isDeleted: true,
      approvalStatus: true, faceData: true, faceImageUrl: true, faceVersion: true,
      event: { select: { requiresApprovalForAccess: true } }
    }
  })
  // Linhas de sync deste terminal (estado atual + detectar órfão-com-linha).
  const rows = await prisma.participantTerminalSync.findMany({
    where: { terminalId },
    // `attempts` entra no select por causa do teto (ver o bloco de update
    // abaixo): sem ele a reconciliação não tem como respeitar a política de
    // retry, e era exatamente assim que o teto vinha sendo contornado.
    // `lastError` entra porque o teto agora depende da CLASSE do erro
    // (lib/agent/retry-policy): sem ele, `isExhausted` trataria uma linha
    // permanente como transitória e a reconciliação a devolveria à fila para
    // falhar mais 11 vezes.
    select: { id: true, participantId: true, faceState: true, cardState: true, removalState: true, faceVersion: true, attempts: true, lastError: true, participant: { select: { employeeNo: true } } }
  })
  const rowByPid = new Map(rows.map((r) => [r.participantId, r]))
  const rowByEmp = new Map(rows.filter((r) => r.participant.employeeNo).map((r) => [r.participant.employeeNo as string, r]))

  const desired = new Set<string>()
  let pushesEnqueued = 0
  let removalsEnqueued = 0

  for (const p of parts) {
    const requiresApproval = p.event?.requiresApprovalForAccess ?? true
    if (!isEligible(p, { requiresApproval })) continue
    const emp = p.employeeNo as string
    desired.add(emp)

    const act = actual.get(emp)
    const row = rowByPid.get(p.id)
    const hasFace = p.faceData != null || p.faceImageUrl != null

    // F5: face trocada (re-captura). Calculada aqui porque decide DUAS coisas:
    // o que re-empurrar, e se a linha ganha um contador de tentativas novo.
    const faceTrocada = faceNeedsUpdate(p, row)

    let needFace = false
    let needCard = false
    if (!act) {
      // FALTANDO no device → re-push do que deveria ter
      needFace = hasFace
      needCard = !!p.cardNumber
    } else {
      if (hasFace && act.numOfFace === 0) needFace = true // face incompleta
      if (p.cardNumber && act.numOfCard === 0) needCard = true // card incompleto
      // F5: face trocada → re-push de face E card (o agente apaga+re-cria, então
      // o card também precisa voltar — senão deleteUser deixaria sem card).
      if (faceTrocada) { needFace = true; needCard = !!p.cardNumber }
    }
    if (!needFace && !needCard) continue

    if (!row) {
      await prisma.participantTerminalSync.create({
        data: { participantId: p.id, terminalId, faceState: needFace ? 'pending' : 'na', cardState: needCard ? 'pending' : 'na', removalState: 'none' }
      })
      pushesEnqueued++
    } else {
      const data: any = {}

      // ── TETO DE TENTATIVAS ───────────────────────────────────────────────
      // Este bloco existe por causa de um loop real: o `/work` só aplica
      // `attempts < MAX_ATTEMPTS` às linhas `failed`, e `pending` não tem teto
      // nenhum. Como a reconciliação devolvia a linha para `pending` a cada
      // ciclo de 60s, o teto NUNCA mordia. Uma participante cuja foto o device
      // recusava de forma determinística acumulou 6.687 tentativas em 6 dias
      // (2026-08-30) — trabalho puro, e a linha oscilando entre "pendente" e
      // "falha" também fazia a tela de saúde mentir.
      //
      // Regra: conteúdo NOVO ganha contador novo; conteúdo IGUAL respeita o
      // teto. Sem a primeira metade, P1 prenderia para sempre uma linha que
      // esgotou por causa transitória (device fora do ar) — e a reconciliação
      // é justamente o mecanismo de recuperação desse caso.
      if (faceTrocada) {
        // Foto nova é uma tentativa legítima: zera o contador e o erro velho.
        data.attempts = 0
        data.lastError = null
        // E o backoff junto — ele foi calculado para a imagem anterior.
        data.nextAttemptAt = null
      } else if (isExhausted(row.attempts, row.lastError)) {
        // Esgotada e nada mudou: retentar produziria exatamente a mesma falha.
        // Daqui em diante é o operador que assume (botão de re-tentar na tela
        // de saúde) ou uma foto nova. NÃO ressuscita sozinha.
        continue
      }

      if (needFace && row.faceState !== 'pending') data.faceState = 'pending'
      if (needCard && row.cardState !== 'pending') data.cardState = 'pending'
      if (row.removalState !== 'none') data.removalState = 'none' // desejado de novo → reviver
      // `attempts`/`lastError` sozinhos não são motivo de update: sem mudança
      // de estado não há nada novo a fazer, e gravar por gravar só produz
      // escrita à toa a cada ciclo de reconciliação.
      if (data.faceState || data.cardState || data.removalState) {
        await prisma.participantTerminalSync.update({ where: { id: row.id }, data })
        pushesEnqueued++
      }
    }
  }

  // ÓRFÃOS: no device, NÃO desejados (desejado XOR órfão — mutuamente exclusivos).
  const removeEmployeeNos: string[] = []
  for (const emp of actual.keys()) {
    if (desired.has(emp)) continue
    const row = rowByEmp.get(emp)
    if (row) {
      // tem linha (participante inelegível) → enfileira removal pelo /work
      if (row.removalState !== 'pending') {
        await prisma.participantTerminalSync.update({ where: { id: row.id }, data: { removalState: 'pending' } })
        removalsEnqueued++
      }
    } else {
      // sem linha/sem participante (delete-hard ou add manual no device) → delete direto
      removeEmployeeNos.push(emp)
    }
  }

  return { pushesEnqueued, removalsEnqueued, removeEmployeeNos }
}
