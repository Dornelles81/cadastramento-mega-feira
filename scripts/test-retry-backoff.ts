/**
 * Backoff progressivo + classificação de erro — `lib/agent/retry-policy`.
 *
 * ── O que quebrou, e que este teste impede de voltar ───────────────────────
 * Até 2026-09-02 havia um teto único (8) com espera FIXA de 60s. Isso aplicava
 * a mesma regra a dois problemas opostos:
 *
 *   · `SubpicAnalysisModelingError` é INTERMITENTE. Duas fotos reais falharam 8
 *     vezes nos 4 terminais, foram devolvidas à fila SEM alteração nenhuma na
 *     imagem, e carregaram. O que as condenava era a janela: 8 tentativas a
 *     cada 60s se esgotam em OITO MINUTOS.
 *   · `badJsonContent`/`faceURL` (foto > ~200 KB) é DETERMINÍSTICO. Ali as 8
 *     tentativas em 4 terminais são 32 chamadas inúteis antes de o operador
 *     descobrir.
 *
 * ── Verificação por mutação ───────────────────────────────────────────────
 * Rodar com `--mutar=backoff` ou `--mutar=classificacao` desliga a peça
 * correspondente e a suíte TEM que falhar. Uma suíte que passa com a correção
 * desligada não estava testando a correção.
 *
 * Requer banco de teste. Uso: .\scripts\testar.ps1 scripts\test-retry-backoff.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-retry-backoff.ts')

import {
  backoffMs, classificarErro, isExhausted, proximaTentativa, tetoDe,
  whereEsgotada, sqlEsgotada,
  MAX_ATTEMPTS_TRANSITORIA, MAX_ATTEMPTS_PERMANENTE, RETRY_BACKOFF_MS, RETRY_BACKOFF_MAX_MS
} from '../lib/agent/retry-policy'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'

const MUTACAO = (process.argv.find((a) => a.startsWith('--mutar=')) ?? '').split('=')[1] ?? null

const ERRO_TRANSITORIO =
  'uploadFace falhou — HTTP 400 — device: statusCode=6 statusString=Invalid Content ' +
  'subStatusCode=SubpicAnalysisModelingError errorCode=1610612791 errorMsg=saveFacePic'
const ERRO_PERMANENTE =
  'uploadFace falhou — HTTP 400 — device: statusCode=6 subStatusCode=badJsonContent errorMsg=faceURL'

const SUF = `retry-${Date.now()}`
let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

/* ── as peças, com a versão MUTADA ao lado ──────────────────────────────────
   A mutação reproduz o comportamento ANTIGO: espera fixa e teto único. */
const backoff = (n: number) => (MUTACAO === 'backoff' ? RETRY_BACKOFF_MS : backoffMs(n))
const classifica = (e: string | null) =>
  MUTACAO === 'classificacao' ? 'transitoria' : classificarErro(e)
const teto = (e: string | null) =>
  MUTACAO === 'classificacao' ? MAX_ATTEMPTS_TRANSITORIA : tetoDe(e)
const esgotou = (n: number, e: string | null) =>
  MUTACAO === 'classificacao' ? n >= MAX_ATTEMPTS_TRANSITORIA : isExhausted(n, e)

async function main() {
  const criados: any = { events: [], terminals: [], participants: [] }
  if (MUTACAO) console.log(`\n*** MUTAÇÃO ATIVA: ${MUTACAO} — a suíte DEVE falhar ***\n`)

  try {
    /* ═══ 1. BACKOFF: a janela, que é o que condenava os intermitentes ═══ */
    console.log('=== 1) backoff progressivo ===')
    const min = (ms: number) => ms / 60_000
    check('1a falha espera 1 min', min(backoff(1)) === 1, min(backoff(1)))
    check('2a espera 2 min', min(backoff(2)) === 2, min(backoff(2)))
    check('4a espera 8 min', min(backoff(4)) === 8, min(backoff(4)))
    check('8a espera 128 min', min(backoff(8)) === 128, min(backoff(8)))
    check('nao passa do teto de 128 min', min(backoff(20)) === min(RETRY_BACKOFF_MAX_MS), min(backoff(20)))

    // O NÚMERO que importa: quanto tempo as tentativas cobrem.
    let total = 0
    for (let n = 1; n < MAX_ATTEMPTS_TRANSITORIA; n++) total += backoff(n)
    const horas = total / 3_600_000
    console.log(`    janela coberta por ${MAX_ATTEMPTS_TRANSITORIA} tentativas: ${horas.toFixed(1)}h`)
    check('cobre pelo menos 8h (atravessa a noite sem ninguem clicar)', horas >= 8, `${horas.toFixed(1)}h`)

    /* ═══ 2. CLASSIFICAÇÃO ═══ */
    console.log('\n=== 2) classificacao do erro ===')
    check('SubpicAnalysisModelingError e TRANSITORIO', classifica(ERRO_TRANSITORIO) === 'transitoria', classifica(ERRO_TRANSITORIO))
    check('badJsonContent+faceURL e PERMANENTE', classifica(ERRO_PERMANENTE) === 'permanente', classifica(ERRO_PERMANENTE))
    check('erro desconhecido cai em transitorio (lado barato)', classifica('ETIMEDOUT') === 'transitoria')
    check('sem erro cai em transitorio', classifica(null) === 'transitoria')
    // Conservador: `badJsonContent` sozinho NÃO é permanente.
    check('badJsonContent SOZINHO nao e permanente (conservador)',
      classificarErro('subStatusCode=badJsonContent errorMsg=outraCoisa') === 'transitoria')

    check('teto permanente = 1', teto(ERRO_PERMANENTE) === MAX_ATTEMPTS_PERMANENTE, teto(ERRO_PERMANENTE))
    check('teto transitorio = 12', teto(ERRO_TRANSITORIO) === MAX_ATTEMPTS_TRANSITORIA, teto(ERRO_TRANSITORIO))

    /* ═══ 3. ESGOTAMENTO por classe ═══ */
    console.log('\n=== 3) esgotamento depende da classe ===')
    check('permanente esgota na 1a', esgotou(1, ERRO_PERMANENTE) === true)
    check('transitorio com 1 NAO esgotou', esgotou(1, ERRO_TRANSITORIO) === false)
    check('transitorio com 8 NAO esgotou (era o teto antigo)', esgotou(8, ERRO_TRANSITORIO) === false)
    check('transitorio com 12 esgotou', esgotou(12, ERRO_TRANSITORIO) === true)

    /* ═══ 4. AGENDAMENTO ═══ */
    console.log('\n=== 4) proximaTentativa ===')
    const t0 = new Date('2026-09-02T12:00:00.000Z')
    const p1 = proximaTentativa(1, ERRO_TRANSITORIO, t0)
    check('agenda a 1a re-tentativa 1 min depois',
      p1 !== null && p1.getTime() - t0.getTime() === 60_000, p1?.toISOString())
    const p9 = proximaTentativa(9, ERRO_TRANSITORIO, t0)
    check('9a tentativa agenda 128 min depois',
      p9 !== null && p9.getTime() - t0.getTime() === 128 * 60_000, p9?.toISOString())
    check('permanente NAO agenda (null = nunca mais)', proximaTentativa(1, ERRO_PERMANENTE, t0) === null)
    check('transitorio esgotado NAO agenda', proximaTentativa(12, ERRO_TRANSITORIO, t0) === null)

    /* ═══ 5. AS TRÊS FORMAS DA MESMA REGRA (o que faz a tela nao mentir) ═══ */
    console.log('\n=== 5) JS, Prisma e SQL concordam ===')
    const ev = await prisma.event.create({
      data: { name: 'RETRY TEST', slug: `r-${SUF}`, code: `R-${SUF}`.slice(0, 20),
              startDate: new Date(), endDate: new Date(Date.now() + 86400000) }
    })
    criados.events.push(ev.id)
    const term = await prisma.terminal.create({
      data: { eventId: ev.id, name: `T-${SUF}`.slice(0, 40), ipAddress: '192.168.44.1',
              isActive: true, passwordEncrypted: encryptString('x') }
    })
    criados.terminals.push(term.id)

    const casos = [
      { rotulo: 'permanente 1 tentativa', erro: ERRO_PERMANENTE, attempts: 1, esperado: true },
      { rotulo: 'permanente 0 tentativa', erro: ERRO_PERMANENTE, attempts: 0, esperado: false },
      { rotulo: 'transitorio 8', erro: ERRO_TRANSITORIO, attempts: 8, esperado: false },
      { rotulo: 'transitorio 12', erro: ERRO_TRANSITORIO, attempts: 12, esperado: true }
    ]
    const ids: Record<string, string> = {}
    let seq = 0
    for (const c of casos) {
      seq++
      const p = await prisma.participant.create({
        data: { eventId: ev.id, name: `P${seq}-${SUF}`.slice(0, 40), cpf: `${Date.now()}${seq}`.slice(-11),
                status: 'active', isDeleted: false, approvalStatus: 'approved', faceData: encryptString('x') }
      })
      criados.participants.push(p.id)
      const linha = await prisma.participantTerminalSync.create({
        data: { participantId: p.id, terminalId: term.id, faceState: 'failed', cardState: 'na',
                removalState: 'none', attempts: c.attempts, lastError: c.erro }
      })
      ids[c.rotulo] = linha.id
    }

    // (a) JS
    for (const c of casos) {
      check(`JS: ${c.rotulo} -> esgotada=${c.esperado}`, esgotou(c.attempts, c.erro) === c.esperado)
    }
    // (b) Prisma — o que a TELA DE FALHAS lista
    const viaPrisma = await prisma.participantTerminalSync.findMany({
      where: { AND: [{ terminalId: term.id }, whereEsgotada()] }, select: { id: true }
    })
    const setPrisma = new Set(viaPrisma.map((x) => x.id))
    for (const c of casos) {
      check(`Prisma: ${c.rotulo} -> ${c.esperado ? 'aparece' : 'nao aparece'} na tela de falhas`,
        setPrisma.has(ids[c.rotulo]) === c.esperado)
    }
    // (c) SQL — o que a TELA DE SAÚDE conta
    const viaSql = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM participant_terminal_sync WHERE "terminalId" = $1 AND ${sqlEsgotada()}`,
      term.id
    )
    const setSql = new Set(viaSql.map((x: any) => x.id))
    for (const c of casos) {
      check(`SQL: ${c.rotulo} -> ${c.esperado ? 'conta' : 'nao conta'} como falha`,
        setSql.has(ids[c.rotulo]) === c.esperado)
    }
    check('Prisma e SQL contam EXATAMENTE o mesmo conjunto',
      setPrisma.size === setSql.size && [...setPrisma].every((x) => setSql.has(x)),
      { prisma: setPrisma.size, sql: setSql.size })

  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.participant.deleteMany({ where: { id: { in: criados.participants } } })
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: criados.terminals } } })
    await prisma.terminal.deleteMany({ where: { id: { in: criados.terminals } } })
    await prisma.event.deleteMany({ where: { id: { in: criados.events } } })

    const ok = falhas === 0
    console.log(`\n=== RESULTADO: ${ok ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S)'} ===`)
    if (MUTACAO) {
      console.log(ok
        ? `\n*** PROBLEMA: com a mutação "${MUTACAO}" a suíte PASSOU. O teste não cobre essa peça. ***`
        : `\n*** OK: a mutação "${MUTACAO}" foi detectada (${falhas} falha(s)). ***`)
    }
    await prisma.$disconnect()
    // Com mutação, o sucesso é FALHAR: inverte o código de saída.
    process.exit(MUTACAO ? (ok ? 1 : 0) : (ok ? 0 : 1))
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
