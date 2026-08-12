/**
 * Alocação Terminal ↔ Evento (com período).
 *
 * O terminal é equipamento físico e existe independente de evento. A alocação é
 * que responde "neste período, este terminal atende este evento" — e é dela que
 * o sync deriva o escopo dos participantes.
 *
 * ASSIMETRIA DELIBERADA:
 *   - criar/vigorar alocação: automático;
 *   - EXPIRAR: apenas MARCA (`expiredAt` + `pendingCleanup`). Este módulo NUNCA
 *     apaga biometria de terminal. Uma feira que estende um dia não pode
 *     esvaziar a catraca sozinha; a remoção efetiva é ação explícita do admin.
 */
import { prisma } from '../prisma'

export interface ActiveAllocation {
  id: string
  terminalId: string
  eventId: string
  eventName: string
  startDate: Date
  endDate: Date
}

export type AllocationLookup =
  | { ok: true; allocation: ActiveAllocation }
  | { ok: false; reason: 'sem-alocacao-vigente'; detail: string }

/**
 * A alocação VIGENTE do terminal: ativa e com `now` dentro do período.
 *
 * Sobreposição é barrada em `createAllocation`, então o normal é haver no máximo
 * uma. Se ainda assim houver mais de uma (dado legado inserido à mão), vence a
 * de início mais recente e o caso é logado — escolher em silêncio esconderia
 * uma inconsistência que muda quem entra no terminal.
 */
export async function resolveActiveAllocation(
  terminalId: string,
  now: Date = new Date()
): Promise<AllocationLookup> {
  const vigentes = await prisma.terminalEvent.findMany({
    where: {
      terminalId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now }
    },
    select: {
      id: true, terminalId: true, eventId: true, startDate: true, endDate: true,
      event: { select: { name: true } }
    },
    orderBy: { startDate: 'desc' }
  })

  if (vigentes.length === 0) {
    return {
      ok: false,
      reason: 'sem-alocacao-vigente',
      detail: `terminal ${terminalId} não tem alocação ativa cobrindo ${now.toISOString()}`
    }
  }

  if (vigentes.length > 1) {
    console.warn(
      `[allocation] terminal ${terminalId} tem ${vigentes.length} alocações vigentes sobrepostas; ` +
      `usando a de início mais recente (${vigentes[0].id}). Corrija o cadastro.`
    )
  }

  const a = vigentes[0]
  return {
    ok: true,
    allocation: {
      id: a.id,
      terminalId: a.terminalId,
      eventId: a.eventId,
      eventName: a.event.name,
      startDate: a.startDate,
      endDate: a.endDate
    }
  }
}

/**
 * A direção INVERSA de `resolveActiveAllocation`: os terminais que atendem este
 * evento AGORA. É o que o fan-out (`sync-enqueue`) e o `/api/agent/work`
 * precisam — eles partem do evento, não do terminal.
 *
 * Só terminais ATIVOS e com alocação vigente. Lista vazia é resposta legítima e
 * significa "nenhum terminal atende este evento neste momento" — evento fora do
 * período não sincroniza ninguém, que é justamente o efeito que o
 * `Terminal.eventId` (vínculo sem período) não conseguia produzir.
 */
export async function listAllocatedTerminalIds(
  eventId: string,
  now: Date = new Date()
): Promise<string[]> {
  const alocacoes = await prisma.terminalEvent.findMany({
    where: {
      eventId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      terminal: { isActive: true }
    },
    select: { terminalId: true },
    distinct: ['terminalId']
  })
  return alocacoes.map((a) => a.terminalId)
}

/**
 * Este terminal atende este evento AGORA? Guarda de escopo para os endpoints do
 * agente, que hoje comparam `Terminal.eventId` com o evento do token.
 */
export async function isTerminalAllocatedToEvent(
  terminalId: string,
  eventId: string,
  now: Date = new Date()
): Promise<boolean> {
  const scope = await resolveActiveAllocation(terminalId, now)
  return scope.ok && scope.allocation.eventId === eventId
}

export interface CreateAllocationInput {
  terminalId: string
  eventId: string
  startDate: Date
  endDate: Date
}

/**
 * Cria a alocação, barrando período invertido e SOBREPOSIÇÃO com outra alocação
 * ativa do mesmo terminal (senão "o evento alocado a este terminal" fica
 * ambíguo e o sync passa a depender de desempate).
 */
export async function createAllocation(input: CreateAllocationInput) {
  if (input.endDate <= input.startDate) {
    throw new Error('Período inválido: dataFim deve ser posterior a dataInicio')
  }

  // Sobreposição: (inícioA <= fimB) E (fimA >= inícioB)
  const conflito = await prisma.terminalEvent.findFirst({
    where: {
      terminalId: input.terminalId,
      isActive: true,
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate }
    },
    select: { id: true, eventId: true, startDate: true, endDate: true }
  })
  if (conflito) {
    throw new Error(
      `Terminal já alocado no período: alocação ${conflito.id} ` +
      `(evento ${conflito.eventId}, ${conflito.startDate.toISOString().slice(0, 10)} → ` +
      `${conflito.endDate.toISOString().slice(0, 10)})`
    )
  }

  return prisma.terminalEvent.create({ data: { ...input } })
}

/**
 * Varredura de expiração. Marca alocações cujo período terminou — e SÓ marca:
 * `expiredAt` + `pendingCleanup=true`. Nenhuma face é removida aqui, de
 * propósito. Idempotente: só pega quem ainda não foi marcado.
 *
 * Retorna as alocações que passaram a exigir limpeza manual.
 */
export async function markExpiredAllocations(now: Date = new Date()) {
  const aExpirar = await prisma.terminalEvent.findMany({
    where: { endDate: { lt: now }, expiredAt: null },
    select: { id: true, terminalId: true, eventId: true, endDate: true }
  })
  if (aExpirar.length === 0) return []

  await prisma.terminalEvent.updateMany({
    where: { id: { in: aExpirar.map(a => a.id) } },
    // pendingCleanup levanta a bandeira; quem apaga é o admin, explicitamente.
    data: { expiredAt: now, pendingCleanup: true }
  })
  return aExpirar
}

/**
 * Alocações expiradas cujas faces ainda não foram retiradas do terminal.
 * É a lista que o admin vê para decidir a remoção — este módulo não decide por
 * ele e não oferece função de "limpar": remover biometria é ação explícita,
 * feita pelo caminho de remoção (fan-out + agente), não por uma varredura.
 */
export async function listPendingCleanups() {
  return prisma.terminalEvent.findMany({
    where: { pendingCleanup: true, cleanedAt: null },
    select: {
      id: true, startDate: true, endDate: true, expiredAt: true,
      terminal: { select: { id: true, name: true, ipAddress: true, isActive: true } },
      event: { select: { id: true, name: true } }
    },
    orderBy: { expiredAt: 'asc' }
  })
}
