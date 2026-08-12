/**
 * Teste de carga: N cadastros CONCORRENTES, foco em saturação de conexão.
 *
 *   npx tsx scripts/loadtest/run.ts --mode=register --event=expofest-2026
 *   npx tsx scripts/loadtest/run.ts --mode=stand --token=<TOKEN_DO_LINK>
 *
 * Flags: --n=50  --face-kb=250  --base=http://localhost:3000  --yes
 *
 * LEIA scripts/loadtest/README.md antes. Resumo do que este script faz de
 * propósito e por quê:
 *  - dispara os N em BARREIRA (todos ao mesmo tempo), não em rampa: saturação
 *    de pool é um fenômeno de pico simultâneo;
 *  - manda X-Forwarded-For único por VU, senão o rate limit (10 req/10min por
 *    IP) devolve 429 no 11º e o teste vira um teste do rate limiter;
 *  - amostra pg_stat_activity em paralelo pelo DIRECT_URL (ver probe.ts);
 *  - marca os cadastros com customData.__loadtest para a limpeza.
 */
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { genCPF, makeFacePayload, vuIp, LOADTEST_TAG } from './fixtures'
import { ConnProbe } from './probe'

const arg = (k: string, d?: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const has = (k: string) => process.argv.includes(`--${k}`)

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })
// --env-file=.env.loadtest aponta a SONDA para o branch. override é obrigatório:
// o tsx auto-injeta .env.local (produção) e o dotenv não sobrescreve o que já existe.
const ENV_FILE = arg('env-file')
if (ENV_FILE) loadEnv({ path: ENV_FILE, override: true })

const MODE = arg('mode', 'register') as 'register' | 'stand'
const N = parseInt(arg('n', '50')!, 10)
const FACE_KB = parseInt(arg('face-kb', '250')!, 10)
const BASE = (arg('base', 'http://localhost:3000')!).replace(/\/$/, '')
const EVENT = arg('event', 'expofest-2026')!
const TOKEN = arg('token', process.env.LOADTEST_STAND_TOKEN)

const DIRECT_URL = process.env.DIRECT_URL
if (!DIRECT_URL) {
  console.error('DIRECT_URL ausente no .env/.env.local — a sonda de conexão precisa dele.')
  process.exit(1)
}

interface Result {
  vu: number
  status: number
  ms: number
  error?: string
  detail?: string
  path?: string
  reserveMs?: number
  createMs?: number
}

const pct = (xs: number[], p: number) =>
  xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0

async function preflight(prisma: PrismaClient, probe: ConnProbe) {
  const dbHost = new URL(DIRECT_URL!).host
  const isLocal = /^(localhost|127\.0\.0\.1)/.test(new URL(BASE).hostname)
  const maxConn = await probe.maxConnections()

  console.log('── Preflight ──────────────────────────────────────────')
  console.log(`  alvo HTTP      : ${BASE}  ${isLocal ? '(local)' : '⚠️  REMOTO'}`)
  console.log(`  banco (sonda)  : ${dbHost}`)
  console.log(`  max_connections: ${maxConn}   (teto de backends do compute)`)
  console.log(`  modo           : ${MODE}   concorrência: ${N}   face: ${FACE_KB} KB`)

  // O fan-out pós-cadastro faz ~2 queries POR TERMINAL ATIVO. É o multiplicador
  // silencioso do tempo que cada request segura uma conexão.
  const ev = await prisma.event.findFirst({
    where: { OR: [{ slug: EVENT.toLowerCase() }, { code: { equals: EVENT, mode: 'insensitive' } }] },
    select: { id: true, name: true, code: true, requiresApprovalForAccess: true, endDate: true },
  })
  if (MODE === 'register') {
    if (!ev) {
      console.error(`\n❌ Evento "${EVENT}" não existe neste banco. Use --event=<slug>.`)
      process.exit(1)
    }
    // Terminais no escopo real do fan-out: ALOCACAO VIGENTE (TerminalEvent),
  // nao a coluna deprecada Terminal.eventId. Consulta inline de proposito —
  // lib/terminals/allocation usa o cliente compartilhado de lib/prisma, e
  // estes scripts falam com o banco de BRANCH pelo seu proprio PrismaClient.
  const agora = new Date()
  const terminals = await prisma.terminalEvent.count({
    where: {
      eventId: ev.id,
      isActive: true,
      startDate: { lte: agora },
      endDate: { gte: agora },
      terminal: { isActive: true }
    }
  })
    const fanout = ev.requiresApprovalForAccess === false
    console.log(`  evento         : ${ev.name} (${ev.code})`)
    console.log(`  fan-out no POST: ${fanout ? `SIM — ${terminals} terminal(is) ativo(s) → ~${4 + 2 * terminals} queries extras/cadastro` : 'não (evento exige aprovação)'}`)
  }

  if (MODE === 'stand') {
    if (!TOKEN) {
      console.error('\n❌ --mode=stand exige --token=<token do link mágico>.')
      process.exit(1)
    }
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update(TOKEN).digest('hex')
    const row = await prisma.standAccessToken.findUnique({
      where: { tokenHash: hash },
      select: {
        revokedAt: true,
        expiresAt: true,
        stand: { select: { id: true, code: true, name: true, maxRegistrations: true, isActive: true } },
      },
    })
    if (!row) {
      console.error('\n❌ Token não encontrado neste banco.')
      process.exit(1)
    }
    if (row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) {
      console.error('\n❌ Token revogado/expirado — todos os requests dariam 404.')
      process.exit(1)
    }
    const occupied = await prisma.participant.count({
      where: { standId: row.stand.id, status: 'active', isDeleted: false },
    })
    const free = row.stand.maxRegistrations - occupied
    console.log(`  stand          : ${row.stand.name} (${row.stand.code})`)
    console.log(`  vagas          : ${occupied}/${row.stand.maxRegistrations} ocupadas → ${free} livres`)
    if (free < N) {
      console.log(
        `\n⚠️  ATENÇÃO: ${free} vagas < ${N} VUs. Os excedentes voltam 409 "Stand lotado"\n` +
          `   ANTES de fazer trabalho de banco — você mede o lock, não a saturação.\n` +
          `   Para medir saturação: suba maxRegistrations >= ${N}.\n` +
          `   Para testar o lock (não-overselling): mantenha assim e confira que\n` +
          `   os 201 são EXATAMENTE ${free}.`
      )
    }
  }
  console.log('───────────────────────────────────────────────────────\n')

  if (!isLocal && !has('yes')) {
    console.error('❌ Alvo remoto sem --yes. Isto grava participantes REAIS no banco do alvo.')
    process.exit(1)
  }
  return ev
}

async function fire(vu: number, body: unknown, path: string): Promise<Result> {
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': vuIp(vu), // 1 IP por VU: sem isso o rate limit mascara tudo
        'User-Agent': `loadtest-vu-${vu}`,
      },
      body: JSON.stringify(body),
    })
    const ms = performance.now() - t0
    let payload: any = null
    try {
      payload = await res.json()
    } catch {
      /* corpo não-JSON (ex.: 413/502 do proxy) */
    }
    return {
      vu,
      status: res.status,
      ms,
      // `message` traz o motivo real (ex.: qual campo o Joi reprovou); `error` é só a categoria
      error: [payload?.error, payload?.message].filter(Boolean).join(' — ') || undefined,
      // register-fixed devolve error.message do Prisma em `details` — é aqui que
      // P2024 (pool timeout) e P2028 (txn timeout) aparecem.
      detail: payload?.details,
      // Observabilidade via headers (só stand-registration com LOADTEST_TRACE=1)
      path: res.headers.get('x-reserve-path') ?? undefined,
      reserveMs: res.headers.get('x-reserve-ms') ? Number(res.headers.get('x-reserve-ms')) : undefined,
      createMs: res.headers.get('x-create-ms') ? Number(res.headers.get('x-create-ms')) : undefined,
    }
  } catch (e: any) {
    return { vu, status: 0, ms: performance.now() - t0, error: `NETWORK: ${e.message}` }
  }
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DIRECT_URL } }, log: ['error'] })
  const probe = new ConnProbe(DIRECT_URL!)
  await probe.start(250)
  const ev = await preflight(prisma, probe)

  // Payloads prontos ANTES do disparo: base64 de 250 KB × 50 é CPU do cliente,
  // não pode entrar na medição.
  const face = makeFacePayload(FACE_KB)
  const stamp = Date.now()
  const bodies = Array.from({ length: N }, (_, i) => {
    const common = {
      name: `Load Test VU${i}`,
      cpf: genCPF(stamp % 1000 + i * 13),
      // TLD real de propósito: Joi.string().email() valida o TLD contra a lista da
      // IANA e reprova .invalid/.test/.local — o 400 não seria da carga, seria do fixture.
      email: `loadtest.vu${i}.${stamp}@example.com`,
      phone: '51999990000',
      faceImage: face,
      faceData: { faceInterocularPx: 92, faceDetected: true },
      consent: true,
      customData: { [LOADTEST_TAG]: true, eventCode: EVENT },
    }
    return MODE === 'stand' ? { ...common, token: TOKEN } : { ...common, eventCode: EVENT }
  })

  const path = MODE === 'stand' ? '/api/stand-registration' : '/api/register-fixed'

  // --n=0 = preflight only: valida cenário e conexão sem gravar nada.
  if (N === 0) {
    await probe.stop()
    console.log('--n=0: preflight apenas, nenhum request disparado.')
    await prisma.$disconnect()
    return
  }

  console.log(`🔥 Disparando ${N} POST ${path} em barreira...\n`)

  const t0 = Date.now()
  const results = await Promise.all(bodies.map((b, i) => fire(i, b, path)))
  const wall = Date.now() - t0

  await probe.stop()

  // ── Relatório ────────────────────────────────────────────────
  const lat = results.map((r) => r.ms)
  const byStatus = new Map<number, number>()
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
  const ok = results.filter((r) => r.status === 201).length

  console.log('── Resultado HTTP ─────────────────────────────────────')
  console.log(`  wall clock : ${wall} ms   throughput: ${(N / (wall / 1000)).toFixed(1)} req/s`)
  console.log(`  201 criados: ${ok}/${N}`)
  for (const [s, n] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    if (s !== 201) console.log(`  ${s || 'NET'}        : ${n}`)
  }
  console.log(`  latência   : p50 ${pct(lat, 50).toFixed(0)}ms  p95 ${pct(lat, 95).toFixed(0)}ms  p99 ${pct(lat, 99).toFixed(0)}ms  max ${Math.max(...lat).toFixed(0)}ms`)

  const failures = results.filter((r) => r.status !== 201)
  if (failures.length) {
    console.log('\n── Falhas (amostra) ───────────────────────────────────')
    const seen = new Set<string>()
    for (const f of failures) {
      const key = `${f.status}|${f.error}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(`  [${f.status}] ${f.error ?? ''}`)
      if (f.detail) console.log(`         ↳ ${f.detail.split('\n')[0]}`)
    }
    // Os dois códigos que provam saturação. stand-registration devolve 500
    // genérico: nesse modo, confira o log do servidor.
    const pool = failures.filter((f) => /P2024|connection pool/i.test(f.detail ?? ''))
    const tx = failures.filter((f) => /P2028|Transaction (already closed|API error)/i.test(f.detail ?? ''))
    if (pool.length) console.log(`\n  🔴 P2024 (pool esgotado, esperou pool_timeout): ${pool.length}`)
    if (tx.length) console.log(`  🔴 P2028 (transação estourou o timeout): ${tx.length}`)
  }

  // Distribuição de caminho (headers de trace, se presentes)
  const traced = results.filter((r) => r.path)
  if (traced.length) {
    const fast = traced.filter((r) => r.path === 'fast').length
    const slow = traced.filter((r) => r.path === 'slow').length
    const stat = (xs: number[]) =>
      xs.length ? `n=${xs.length} p50=${pct(xs, 50).toFixed(0)} p95=${pct(xs, 95).toFixed(0)} max=${Math.max(...xs).toFixed(0)}` : '—'
    console.log('\n── Caminho da reserva (trace) ─────────────────────────')
    console.log(`  FAST (UPDATE atômico): ${fast}    SLOW (txn autoritativa): ${slow}`)
    console.log(`  reserve ms: ${stat(traced.map((r) => r.reserveMs!).filter((x) => !isNaN(x)))}`)
    console.log(`  create  ms: ${stat(results.map((r) => r.createMs!).filter((x) => x != null && !isNaN(x)))}`)
  }

  const s = probe.summary()
  console.log('\n── Conexões no compute (pg_stat_activity) ─────────────')
  console.log(`  amostras          : ${s.samples} @250ms`)
  console.log(`  PICO de backends  : ${s.peakTotal}`)
  console.log(`  pico active       : ${s.peakActive}`)
  console.log(`  pico idle in tx   : ${s.peakIdleInTx}   ← txn segurando conexão (FOR UPDATE)`)
  console.log(`  pico esperando Lock: ${s.peakWaitingOnLock}   ← serialização na linha do stand`)
  console.log('\n(veja a leitura desses números em scripts/loadtest/README.md)')

  console.log(`\n🧹 Limpeza: npx tsx scripts/loadtest/cleanup.ts${ev ? ` --event=${EVENT}` : ''}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
