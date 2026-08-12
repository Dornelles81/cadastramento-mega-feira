/**
 * Seleção de participantes para o sync facial de UM terminal.
 *
 * ÚNICO lugar onde se decide QUEM vai para o dispositivo. A pergunta que este
 * módulo responde NÃO é "quais participantes ativos existem", e sim:
 *
 *   quais participantes ativos DO EVENTO ALOCADO A ESTE TERMINAL, dentro do
 *   período de alocação vigente
 *
 * Dois gates, ambos obrigatórios e nenhum derivável do outro:
 *
 *   1. ESCOPO   — evento vem da alocação vigente (`lib/terminals/allocation`).
 *      Sem alocação vigente o terminal não seleciona ninguém: não existe
 *      "todos os participantes do banco".
 *   2. CRÍTICO  — status = 'active' AND isDeleted = false. Sem ele o sync
 *      recadastra quem foi excluído, reabrindo o acesso físico de alguém
 *      removido (ADENDO acesso-por-stand, seção 5).
 *
 * Os dois valem igualmente no modo em massa e no modo participante único: pedir
 * um removido — ou alguém de outro evento — pelo id não pode furar a regra.
 *
 * O identificador no terminal é o `Participant.employeeNo` (sequencial global,
 * imutável, Fase 1) — que é também o FPID da face. É número por PARTICIPAÇÃO,
 * não por pessoa: a mesma pessoa em duas feiras tem dois employeeNo distintos,
 * e o sequencial global elimina colisão no device sem precisar de prefixo.
 */
import { prisma } from '../prisma'
import { isEligible } from '../agent/eligibility'
import { resolveActiveAllocation, type ActiveAllocation } from '../terminals/allocation'

/** Filtro crítico: nunca sincronizar removido/excluído. */
export const ACTIVE_ONLY = { status: 'active', isDeleted: false } as const

export interface SyncTarget {
  id: string
  name: string
  employeeNo: string
  cardNumber: string | null
  faceData: Buffer | null
  faceImageUrl: string | null
  requiresApproval: boolean
}

/** Motivo pelo qual um participante NÃO é sincronizável neste terminal. */
export type RefusalReason =
  | 'sem-alocacao-vigente'          // o terminal não atende evento nenhum agora
  | 'participante-de-outro-evento'  // existe, mas fora do escopo deste terminal
  | 'not-found'
  | 'removed'                       // status != 'active' ou isDeleted — gate crítico
  | 'no-employee-no'                // sem identidade atribuída (Fase 1)
  | 'not-eligible'                  // sem face utilizável ou sem aprovação exigida

export type TargetLookup =
  | { ok: true; target: SyncTarget; allocation: ActiveAllocation }
  | { ok: false; reason: RefusalReason; detail: string }

export type TargetsLookup =
  | { ok: true; targets: SyncTarget[]; allocation: ActiveAllocation }
  | { ok: false; reason: 'sem-alocacao-vigente'; detail: string }

const SELECT = {
  id: true,
  name: true,
  eventId: true,
  employeeNo: true,
  cardNumber: true,
  faceData: true,
  faceImageUrl: true,
  status: true,
  isDeleted: true,
  approvalStatus: true,
  event: { select: { requiresApprovalForAccess: true } }
} as const

function toTarget(p: any): SyncTarget {
  return {
    id: p.id,
    name: p.name,
    employeeNo: p.employeeNo,
    cardNumber: p.cardNumber,
    faceData: p.faceData ? Buffer.from(p.faceData) : null,
    faceImageUrl: p.faceImageUrl,
    requiresApproval: p.event?.requiresApprovalForAccess ?? true
  }
}

function eligibleForDevice(p: any): boolean {
  const requiresApproval = p.event?.requiresApprovalForAccess ?? true
  return isEligible(p, { requiresApproval })
}

/**
 * Todos os participantes sincronizáveis DESTE terminal (modo --all).
 * Escopo e filtro crítico entram na query; elegibilidade (face + aprovação por
 * evento) é aplicada em memória porque depende do flag do evento.
 */
export async function fetchSyncTargets(
  terminalId: string,
  opts: { limit?: number; now?: Date } = {}
): Promise<TargetsLookup> {
  const scope = await resolveActiveAllocation(terminalId, opts.now)
  if (!scope.ok) return scope

  const rows = await prisma.participant.findMany({
    where: {
      eventId: scope.allocation.eventId, // ESCOPO: só o evento alocado
      ...ACTIVE_ONLY,
      employeeNo: { not: null }
    },
    select: SELECT,
    orderBy: { employeeNo: 'asc' }
  })

  // O limite vale sobre os ELEGÍVEIS (não sobre a query crua): `--limit=1` tem
  // que entregar 1 participante sincronizável, não 1 candidato que a
  // elegibilidade descarta em seguida, devolvendo lista vazia.
  const eligible = rows.filter(eligibleForDevice).map(toTarget)
  return {
    ok: true,
    allocation: scope.allocation,
    targets: opts.limit ? eligible.slice(0, opts.limit) : eligible
  }
}

/**
 * Um participante específico neste terminal (modo --participant), por `id` OU
 * por `employeeNo`.
 *
 * Busca SEM os gates de propósito, para distinguir "não existe" de "existe mas
 * está removido" de "existe e está ativo, só que em outro evento" — e então
 * RECUSA cada caso com motivo próprio. Quem roda o teste precisa ver a
 * diferença; o dispositivo não pode ver nenhum dos três.
 */
export async function fetchSyncTarget(
  terminalId: string,
  idOrEmployeeNo: string,
  opts: { now?: Date } = {}
): Promise<TargetLookup> {
  const scope = await resolveActiveAllocation(terminalId, opts.now)
  if (!scope.ok) return scope

  const p = await prisma.participant.findFirst({
    where: { OR: [{ id: idOrEmployeeNo }, { employeeNo: idOrEmployeeNo }] },
    select: SELECT
  })

  if (!p) {
    return { ok: false, reason: 'not-found', detail: `nenhum participante com id/employeeNo "${idOrEmployeeNo}"` }
  }

  // Gate crítico ANTES do escopo: um removido é reportado como removido em
  // qualquer terminal, sem depender de a qual evento ele pertencia.
  if (p.status !== 'active' || p.isDeleted) {
    return {
      ok: false,
      reason: 'removed',
      detail: `participante REMOVIDO (status=${p.status}, isDeleted=${p.isDeleted}) — sincronizá-lo reabriria o acesso físico`
    }
  }

  // Gate de escopo.
  if (p.eventId !== scope.allocation.eventId) {
    return {
      ok: false,
      reason: 'participante-de-outro-evento',
      detail: `participante é do evento ${p.eventId ?? '(nenhum)'}, mas este terminal atende "${scope.allocation.eventName}" (${scope.allocation.eventId})`
    }
  }

  if (!p.employeeNo) {
    return { ok: false, reason: 'no-employee-no', detail: 'sem employeeNo atribuído (identidade da Fase 1 não foi gerada)' }
  }

  if (!eligibleForDevice(p)) {
    const requiresApproval = p.event?.requiresApprovalForAccess ?? true
    const motivo = requiresApproval && p.approvalStatus !== 'approved'
      ? `aprovação exigida pelo evento e approvalStatus=${p.approvalStatus}`
      : 'sem foto facial utilizável'
    return { ok: false, reason: 'not-eligible', detail: motivo }
  }

  return { ok: true, target: toTarget(p), allocation: scope.allocation }
}
