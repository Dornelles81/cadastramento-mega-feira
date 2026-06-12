import { lastDayReset, nextDayReset } from '../lib/stand-access/occupancy'

// Horários em America/Sao_Paulo (UTC-3): SP 03:59 = 06:59Z
function spTime(iso: string) { return new Date(iso) }
const cases: Array<[string, Date, string, string]> = [
  // [descrição, agora(UTC), lastReset esperado (UTC), nextReset esperado (UTC)]
  ['SP 03:59 (antes da virada das 4h)', spTime('2026-06-12T06:59:00Z'), '2026-06-11T07:00:00.000Z', '2026-06-12T07:00:00.000Z'],
  ['SP 04:00 (virada exata)',           spTime('2026-06-12T07:00:00Z'), '2026-06-12T07:00:00.000Z', '2026-06-13T07:00:00.000Z'],
  ['SP 04:01 (depois da virada)',       spTime('2026-06-12T07:01:00Z'), '2026-06-12T07:00:00.000Z', '2026-06-13T07:00:00.000Z'],
  ['SP 23:30',                          spTime('2026-06-13T02:30:00Z'), '2026-06-12T07:00:00.000Z', '2026-06-13T07:00:00.000Z'],
  ['SP 00:30 (madrugada, antes das 4h)',spTime('2026-06-13T03:30:00Z'), '2026-06-12T07:00:00.000Z', '2026-06-13T07:00:00.000Z'],
]
let fail = 0
for (const [desc, now, expLast, expNext] of cases) {
  const last = lastDayReset(4, now).toISOString()
  const next = nextDayReset(4, now).toISOString()
  const ok = last === expLast && next === expNext
  if (!ok) fail++
  console.log(ok ? '✓' : '✗', desc, '| last:', last, ok ? '' : `(esperado ${expLast})`, '| next:', next, ok ? '' : `(esperado ${expNext})`)
}
// Cenário da SPEC: check-in às 3h58, exclusão às 4h05 → check-in é do dia ANTERIOR
const checkin = spTime('2026-06-12T06:58:00Z')   // SP 03:58
const exclusao = spTime('2026-06-12T07:05:00Z')  // SP 04:05
const pertenceAoDiaCorrente = checkin.getTime() >= lastDayReset(4, exclusao).getTime()
console.log(pertenceAoDiaCorrente ? '✗ check-in 3h58 contaria como de hoje (ERRADO)' : '✓ check-in 3h58 + exclusão 4h05: check-in é do dia anterior → libera na hora')
process.exit(fail > 0 ? 1 : 0)
