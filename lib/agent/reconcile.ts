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

export interface DeviceUser {
  employeeNo: string
  numOfFace: number
  numOfCard: number
}
export interface ReconcileResult {
  pushesEnqueued: number
  removalsEnqueued: number
  removeEmployeeNos: string[] // órfãos SEM linha de sync → o agente deleta direto
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
  eventId: string,
  terminalId: string,
  deviceUsers: DeviceUser[]
): Promise<ReconcileResult> {
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
    select: { id: true, participantId: true, faceState: true, cardState: true, removalState: true, faceVersion: true, participant: { select: { employeeNo: true } } }
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
      if (faceNeedsUpdate(p, row)) { needFace = true; needCard = !!p.cardNumber }
    }
    if (!needFace && !needCard) continue

    if (!row) {
      await prisma.participantTerminalSync.create({
        data: { participantId: p.id, terminalId, faceState: needFace ? 'pending' : 'na', cardState: needCard ? 'pending' : 'na', removalState: 'none' }
      })
      pushesEnqueued++
    } else {
      const data: any = {}
      if (needFace && row.faceState !== 'pending') data.faceState = 'pending'
      if (needCard && row.cardState !== 'pending') data.cardState = 'pending'
      if (row.removalState !== 'none') data.removalState = 'none' // desejado de novo → reviver
      if (Object.keys(data).length) {
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
