/**
 * Fila do `/api/agent/work`: o `limit` só pode ser ocupado por item servível.
 *
 * ── Por que este arquivo existe (2026-10-06, Expofest) ─────────────────────
 * O `/work` cortava as 50 linhas mais antigas e só DEPOIS descartava as
 * esgotadas e as de participante não elegível. Mortas e antigas, elas ficavam
 * para sempre na frente: 40 das 50 vagas, ritmo de ~9 para ~2,5 itens/min por
 * terminal. Ver `lib/agent/work-queue.ts`.
 *
 * Cobre:
 *   1) 60+ linhas mortas na FRENTE da fila (esgotadas transitórias e
 *      permanentes, removidos, não aprovados, apagados, sem foto, sem
 *      employeeNo) e 20 válidas atrás → as 20 saem no PRIMEIRO ciclo
 *   2) o que o filtro NÃO pode tirar: remoção de inelegível, `pending` com
 *      `attempts` alto (o ack de sucesso também conta), falha transitória com
 *      backoff vencido, evento sem exigência de aprovação
 *   3) backoff no futuro continua fora
 *   4) o `limit` ainda corta, na ordem de `createdAt`
 *   5) as esgotadas ficam intactas e a tela de falhas as conta como antes;
 *      depois do "Re-tentar" voltam a ser servidas
 *
 * Chama o handler do `/work` NO PROCESSO (req/res simulados): não precisa do
 * dev server, e por isso não existe o risco de um servidor lendo o
 * `.env.local` escrever em produção. Cria e apaga seus próprios dados.
 *
 * Uso: .\scripts\testar.ps1 scripts\test-work-fila.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-work-fila.ts')

import { prisma } from '../lib/prisma'
import { createAllocation } from '../lib/terminals/allocation'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { MAX_ATTEMPTS, whereEsgotada } from '../lib/agent/retry-policy'
import workHandler from '../pages/api/agent/work'

const SUF = `wq-${Date.now()}`
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)
const ERRO_TRANSITORIO = 'uploadFace falhou — device: subStatusCode=SubpicAnalysisModelingError'
const ERRO_PERMANENTE = 'uploadFace falhou — device: statusCode=6 subStatusCode=badJsonContent errorMsg=faceURL'

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

/** Um ciclo do agente: GET /work com o token, pelo handler real. */
async function cicloWork(token: string, limit = 50): Promise<{ status: number; body: any }> {
  let status = 0
  let body: any = null
  const req: any = { method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { limit: String(limit) } }
  const res: any = {
    status(c: number) { status = c; return res },
    json(b: any) { body = b; return res }
  }
  await workHandler(req, res)
  return { status, body }
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  let seq = 0
  try {
    const now = new Date()
    const base = now.getTime() - 3600_000 // createdAt controlado: mortas antes, válidas depois

    const mkEvent = async (tag: string, requiresApprovalForAccess: boolean) => {
      const ev = await prisma.event.create({
        data: {
          name: `WORK FILA ${tag}`, slug: `${tag}-${SUF}`, code: `${tag}-${SUF}`.slice(0, 20),
          startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess
        }
      })
      created.events.push(ev.id)
      const terms = []
      for (const ip of ['192.168.9.81', '192.168.9.82']) {
        const t = await prisma.terminal.create({
          data: { eventId: ev.id, name: `WQ ${tag} ${ip}`, ipAddress: ip, isActive: true, passwordEncrypted: encryptString('x') }
        })
        created.terminals.push(t.id)
        await createAllocation({
          terminalId: t.id, eventId: ev.id,
          startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000)
        })
        terms.push(t)
      }
      const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: `PC ${tag}` })
      created.tokens.push(tokId)
      return { ev, terms, token }
    }

    /** Participante + uma linha de sync por terminal. Devolve as linhas. */
    const mk = async (
      ev: { id: string }, terms: { id: string }[], tag: string,
      p: Partial<{ status: string; isDeleted: boolean; approvalStatus: string; semFoto: boolean; semEmp: boolean }>,
      row: Partial<{ faceState: string; cardState: string; removalState: string; attempts: number; lastError: string | null; nextAttemptAt: Date | null }>,
      createdAtMs: number
    ) => {
      seq++
      const emp = p.semEmp ? null : `wq${String(Date.now()).slice(-6)}${String(seq).padStart(4, '0')}`
      const part = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `${tag} ${seq}`, cpf: `${SUF}-${seq}`,
          status: p.status ?? 'active', isDeleted: p.isDeleted ?? false,
          approvalStatus: p.approvalStatus ?? 'approved',
          employeeNo: emp, cardNumber: emp ? `9${String(seq).padStart(9, '0')}` : null,
          faceData: p.semFoto ? null : FACE
        }
      })
      created.participants.push(part.id)
      const rows = []
      for (const t of terms) {
        rows.push(await prisma.participantTerminalSync.create({
          data: {
            participantId: part.id, terminalId: t.id,
            faceState: row.faceState ?? 'pending', cardState: row.cardState ?? 'pending',
            removalState: row.removalState ?? 'none',
            attempts: row.attempts ?? 0, lastError: row.lastError ?? null,
            nextAttemptAt: row.nextAttemptAt ?? null,
            createdAt: new Date(createdAtMs)
          }
        }))
      }
      return { part, rows }
    }

    // ════════════════════════════════════════════════════════════════════
    console.log('\n=== 1) linhas mortas NA FRENTE, válidas atrás ===')
    const A = await mkEvent('wqa', true)
    let t = base
    const mortas: string[] = []
    const add = (xs: { rows: { id: string }[] }) => mortas.push(...xs.rows.map((r) => r.id))
    // 28 pessoas × 2 terminais = 56 esgotadas transitórias (o caso do Expofest:
    // nextAttemptAt null depois de esgotar).
    for (let i = 0; i < 28; i++) {
      add(await mk(A.ev, A.terms, 'esgotada', {}, { faceState: 'failed', cardState: 'synced', attempts: MAX_ATTEMPTS, lastError: ERRO_TRANSITORIO }, t += 1000))
    }
    // permanentes: esgotam com 1 tentativa
    for (let i = 0; i < 3; i++) {
      add(await mk(A.ev, A.terms, 'permanente', {}, { faceState: 'failed', cardState: 'synced', attempts: 1, lastError: ERRO_PERMANENTE }, t += 1000))
    }
    // removidos com face/card ainda pending e remoção já confirmada (o outro caso do Expofest)
    for (let i = 0; i < 3; i++) {
      add(await mk(A.ev, A.terms, 'removido', { status: 'removed', semFoto: true }, { removalState: 'removed', attempts: 1 }, t += 1000))
    }
    add(await mk(A.ev, A.terms, 'nao-aprovado', { approvalStatus: 'pending' }, {}, t += 1000))
    add(await mk(A.ev, A.terms, 'apagado', { isDeleted: true }, {}, t += 1000))
    add(await mk(A.ev, A.terms, 'sem-foto', { semFoto: true }, {}, t += 1000))
    add(await mk(A.ev, A.terms, 'sem-emp', { semEmp: true }, {}, t += 1000))
    console.log(`   ${mortas.length} linhas mortas na frente`)
    check('mais de 50 linhas mortas na frente (o limit inteiro)', mortas.length > 50, mortas.length)

    const validas: string[] = []
    for (let i = 0; i < 10; i++) {
      validas.push(...(await mk(A.ev, A.terms, 'valida', {}, {}, t += 1000)).rows.map((r) => r.id))
    }
    const r1 = await cicloWork(A.token, 50)
    check('200', r1.status === 200, r1.status)
    const servidosA = new Set<string>((r1.body.push ?? []).map((i: any) => i.syncId))
    check('as 20 válidas saíram no PRIMEIRO ciclo', validas.every((id) => servidosA.has(id)), `${validas.filter((id) => servidosA.has(id)).length}/20`)
    check('nenhuma morta servida', mortas.every((id) => !servidosA.has(id)), mortas.filter((id) => servidosA.has(id)).length)
    check('nenhuma remoção espúria', (r1.body.removals ?? []).length === 0, r1.body.removals?.length)
    check('face e card pedidos, face em claro no payload',
      (r1.body.push ?? []).every((i: any) => i.needFace && i.needCard && typeof i.face === 'string' && i.face.startsWith('data:image/')))
    check('contrato: mesmas chaves de antes no item',
      (r1.body.push ?? []).every((i: any) =>
        ['syncId', 'terminalId', 'employeeNo', 'name', 'cardNumber', 'validBegin', 'validEnd', 'faceVersion', 'needFace', 'needCard', 'face']
          .every((k) => k in i) && Object.keys(i).length === 11))

    // ════════════════════════════════════════════════════════════════════
    console.log('\n=== 2) o que o filtro NÃO pode tirar ===')
    const B = await mkEvent('wqb', true)
    t = base
    // remoção de inelegível: servida sempre
    const remPend = await mk(B.ev, B.terms, 'rem-pend', { status: 'removed', semFoto: true }, { faceState: 'synced', cardState: 'synced', removalState: 'pending', attempts: 2 }, t += 1000)
    // remoção que falhou, backoff vencido (null), abaixo do teto
    const remFail = await mk(B.ev, B.terms, 'rem-fail', { status: 'removed' }, { faceState: 'synced', cardState: 'synced', removalState: 'failed', attempts: 3, lastError: 'deleteUser falhou — timeout' }, t += 1000)
    // pending com attempts acima do teto, SEM falha: o ack de sucesso também incrementa
    const pendAlto = await mk(B.ev, B.terms, 'pend-alto', {}, { faceState: 'pending', cardState: 'synced', attempts: MAX_ATTEMPTS + 4 }, t += 1000)
    // falha transitória abaixo do teto, backoff já vencido
    const transViva = await mk(B.ev, B.terms, 'trans-viva', {}, { faceState: 'failed', cardState: 'synced', attempts: 5, lastError: ERRO_TRANSITORIO, nextAttemptAt: new Date(now.getTime() - 60_000) }, t += 1000)
    // card falhou, face synced (só card pedido)
    const cardViva = await mk(B.ev, B.terms, 'card-viva', {}, { faceState: 'synced', cardState: 'failed', attempts: 3, lastError: 'registerCard falhou — timeout' }, t += 1000)
    // 3) backoff no FUTURO: continua fora
    const futuro = await mk(B.ev, B.terms, 'futuro', {}, { faceState: 'failed', cardState: 'synced', attempts: 4, lastError: ERRO_TRANSITORIO, nextAttemptAt: new Date(now.getTime() + 3600_000) }, t += 1000)

    const r2 = await cicloWork(B.token, 50)
    const pushB = new Map<string, any>((r2.body.push ?? []).map((i: any) => [i.syncId, i]))
    const remB = new Set<string>((r2.body.removals ?? []).map((i: any) => i.syncId))
    check('remoção pending de inelegível é servida', remPend.rows.every((r) => remB.has(r.id)))
    check('remoção failed com backoff vencido é servida', remFail.rows.every((r) => remB.has(r.id)))
    check(`pending com attempts=${MAX_ATTEMPTS + 4} (sem falha) é servido`, pendAlto.rows.every((r) => pushB.has(r.id)))
    check('falha transitória abaixo do teto é servida', transViva.rows.every((r) => pushB.has(r.id)))
    check('card failed é servido só com needCard',
      cardViva.rows.every((r) => pushB.get(r.id)?.needCard === true && pushB.get(r.id)?.needFace === false && pushB.get(r.id)?.face === null))

    console.log('\n=== 3) backoff no futuro continua fora ===')
    check('linha esperando o backoff NÃO é servida', futuro.rows.every((r) => !pushB.has(r.id) && !remB.has(r.id)))

    console.log('\n=== 2b) evento SEM exigência de aprovação ===')
    const C = await mkEvent('wqc', false)
    const semAprov = await mk(C.ev, C.terms, 'sem-aprov', { approvalStatus: 'pending' }, {}, base)
    const r3 = await cicloWork(C.token, 50)
    const pushC = new Set<string>((r3.body.push ?? []).map((i: any) => i.syncId))
    check('não aprovado é servido quando o evento não exige aprovação', semAprov.rows.every((r) => pushC.has(r.id)))

    // ════════════════════════════════════════════════════════════════════
    console.log('\n=== 4) o limit ainda corta, em ordem de createdAt ===')
    // Evento A: 20 válidas. limit=7 → as 7 válidas mais antigas, mortas puladas.
    const r4 = await cicloWork(A.token, 7)
    const ids4 = (r4.body.push ?? []).map((i: any) => i.syncId)
    check('7 itens com limit=7', ids4.length === 7, ids4.length)
    check('são as 7 válidas mais antigas, na ordem', JSON.stringify(ids4) === JSON.stringify(validas.slice(0, 7)))

    // ════════════════════════════════════════════════════════════════════
    console.log('\n=== 5) esgotadas intactas, tela de falhas e Re-tentar ===')
    const esgA = await prisma.participantTerminalSync.findMany({
      where: { id: { in: mortas }, faceState: 'failed' },
      select: { id: true, attempts: true, lastError: true, faceState: true, nextAttemptAt: true }
    })
    check('esgotadas continuam failed, attempts e lastError intactos',
      esgA.length === 62 && esgA.every((r) => r.faceState === 'failed' && !!r.lastError && (r.attempts === MAX_ATTEMPTS || r.attempts === 1)), esgA.length)
    // Mesmo `where` da tela de falhas / do botão (pages/api/admin/eventos/[slug]/sync-falhas.ts).
    const whereEsgotadas = {
      AND: [
        { terminalId: { in: A.terms.map((x) => x.id) } },
        whereEsgotada(),
        { OR: [{ faceState: 'failed' }, { cardState: 'failed' }, { removalState: 'failed' }] }
      ]
    }
    const naTela = await prisma.participantTerminalSync.count({ where: whereEsgotadas })
    check('tela de falhas conta as 62 esgotadas (56 transitórias + 6 permanentes)', naTela === 62, naTela)

    // "Re-tentar" de UMA linha: os mesmos campos que o POST de sync-falhas grava.
    const alvo = esgA[0].id
    await prisma.participantTerminalSync.update({
      where: { id: alvo },
      data: { faceState: 'pending', attempts: 0, lastError: null, nextAttemptAt: null }
    })
    const r5 = await cicloWork(A.token, 50)
    check('depois do Re-tentar a linha volta a ser servida', (r5.body.push ?? []).some((i: any) => i.syncId === alvo))
    const naTelaDepois = await prisma.participantTerminalSync.count({ where: whereEsgotadas })
    check('e sai da tela de falhas (61)', naTelaDepois === 61, naTelaDepois)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of created.tokens) { try { await revokeAgentToken(id) } catch {} }
    await prisma.agentToken.deleteMany({ where: { id: { in: created.tokens } } }).catch(() => {})
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
