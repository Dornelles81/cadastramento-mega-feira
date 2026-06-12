/**
 * Fase 7 — dia operacional e definição canônica de "vaga ocupada".
 *
 * Regra de ouro: uma vaga utilizada no dia não pode ser reutilizada no mesmo
 * dia. O dia operacional vira no horário `dayResetHour` do evento (default
 * 4h, timezone America/Sao_Paulo — fixa; o evento é físico no Brasil).
 *
 *   ocupada = (status='active' AND isDeleted=false)
 *             OR (status='removed' AND slotLockedUntil > now())
 *
 * Sobre `dayResetHour`: o lock grava um instante ABSOLUTO (slotLockedUntil =
 * próxima virada calculada na exclusão). Alterar o dayResetHour do evento NÃO
 * recalcula locks existentes — vale apenas para exclusões futuras.
 *
 * Sobre o cache `currentCount`: ele grava a contagem INCLUINDO locks no
 * momento da escrita, mas um slot travado "libera sozinho" quando
 * slotLockedUntil expira, sem evento de escrita. Por isso o cache serve
 * apenas para exibição (tolerante a pequena defasagem) e os pontos críticos
 * — validação de vaga na transação de cadastro — SEMPRE recontam com
 * occupiedSlotsWhere() dentro da transação.
 */

export const SP_TIMEZONE = 'America/Sao_Paulo'
// Brasil não adota horário de verão desde 2019: America/Sao_Paulo = UTC-3 fixo
const SP_UTC_OFFSET_HOURS = 3

/** Hora atual no relógio de São Paulo, decomposta. */
function spClock(now: Date) {
  const utcMs = now.getTime()
  const spMs = utcMs - SP_UTC_OFFSET_HOURS * 3600_000
  const sp = new Date(spMs) // campos UTC deste Date = relógio de SP
  return {
    y: sp.getUTCFullYear(),
    m: sp.getUTCMonth(),
    d: sp.getUTCDate(),
    h: sp.getUTCHours()
  }
}

/** Instante (UTC) de "hoje às H:00 em São Paulo", com deslocamento de dias. */
function spDateAtHour(now: Date, hour: number, dayOffset: number): Date {
  const { y, m, d } = spClock(now)
  return new Date(Date.UTC(y, m, d + dayOffset, hour + SP_UTC_OFFSET_HOURS, 0, 0, 0))
}

/** Última virada do dia operacional: hoje às dayResetHour se já passou; senão ontem. */
export function lastDayReset(dayResetHour: number, now: Date = new Date()): Date {
  const todayReset = spDateAtHour(now, dayResetHour, 0)
  return now.getTime() >= todayReset.getTime()
    ? todayReset
    : spDateAtHour(now, dayResetHour, -1)
}

/** Próxima virada do dia operacional. */
export function nextDayReset(dayResetHour: number, now: Date = new Date()): Date {
  const todayReset = spDateAtHour(now, dayResetHour, 0)
  return now.getTime() < todayReset.getTime()
    ? todayReset
    : spDateAtHour(now, dayResetHour, 1)
}

/** Where Prisma da definição canônica de vaga ocupada para um stand. */
export function occupiedSlotsWhere(standId: string, now: Date = new Date()) {
  return {
    standId,
    isDeleted: false,
    OR: [
      { status: 'active' },
      { status: 'removed', slotLockedUntil: { gt: now } }
    ]
  }
}

/** Variante para uso em `_count`/`include` (sem o standId, já implícito na relação). */
export function occupiedSlotsRelationWhere(now: Date = new Date()) {
  return {
    isDeleted: false,
    OR: [
      { status: 'active' },
      { status: 'removed', slotLockedUntil: { gt: now } }
    ]
  }
}

/** Formata a próxima liberação para mensagens ao usuário (ex.: "4h de 13/06/2026"). */
export function formatRelease(date: Date): string {
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', timeZone: SP_TIMEZONE }).format(date)
  const day = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: SP_TIMEZONE }).format(date)
  return `${hour}h de ${day}`
}
