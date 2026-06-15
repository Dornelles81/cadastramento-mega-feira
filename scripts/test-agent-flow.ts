/**
 * Teste do agente-fake para os endpoints /api/agent/* (Fase 0 Parte 4).
 *
 * Semeia (via Prisma, lado-nuvem) 2 eventos isolados, terminais com senha
 * criptografada, um participante elegível com face criptografada e linhas de
 * sync pendentes; gera tokens de agente reais; então exercita os endpoints por
 * HTTP como o agente faria — incluindo os testes negativos (token revogado e
 * isolamento de escopo entre eventos). Limpa tudo no final.
 *
 * Requer o dev server no ar (http://localhost:3000) com MASTER_KEY no ambiente.
 *   AGENT_TEST_BASE pode sobrescrever a URL base.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `agenttest-${Date.now()}`
const FACE_PLAIN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ-FAKEFACE-' + SUF

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function call(method: string, path: string, token: string | null, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let json: any = null
  try { json = await res.json() } catch { /* sem corpo */ }
  return { status: res.status, json }
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], syncs: [], tokens: [] }
  try {
    const now = new Date()
    const end = new Date(now.getTime() + 86400000)

    // --- Evento A (exige aprovação) + Evento B (isolamento) ---
    const evA = await prisma.event.create({
      data: { name: 'AGENT TEST A', slug: `a-${SUF}`, code: `A-${SUF}`, startDate: now, endDate: end, requiresApprovalForAccess: true }
    })
    const evB = await prisma.event.create({
      data: { name: 'AGENT TEST B', slug: `b-${SUF}`, code: `B-${SUF}`, startDate: now, endDate: end, requiresApprovalForAccess: true }
    })
    created.events.push(evA.id, evB.id)

    // --- Terminais (senha criptografada) ---
    const PASS_A = 'SenhaDeviceA#2026'
    const termA = await prisma.terminal.create({
      data: { eventId: evA.id, name: 'BANCADA A', ipAddress: '192.168.1.50', passwordEncrypted: encryptString(PASS_A) }
    })
    const termB = await prisma.terminal.create({
      data: { eventId: evB.id, name: 'BANCADA B', ipAddress: '192.168.1.60', passwordEncrypted: encryptString('SenhaB') }
    })
    created.terminals.push(termA.id, termB.id)

    // --- Participante elegível com face criptografada (evento A) ---
    const partPush = await prisma.participant.create({
      data: {
        eventId: evA.id, name: 'Fulano Push', cpf: `000${Date.now()}`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved',
        cardNumber: '9001', credentialNumber: '42', faceData: encryptString(FACE_PLAIN)
      }
    })
    // Participante para remoção (evento A)
    const partRem = await prisma.participant.create({
      data: {
        eventId: evA.id, name: 'Fulano Remove', cpf: `111${Date.now()}`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved',
        cardNumber: '9002', faceData: encryptString(FACE_PLAIN)
      }
    })
    created.participants.push(partPush.id, partRem.id)

    const syncPush = await prisma.participantTerminalSync.create({
      data: { participantId: partPush.id, terminalId: termA.id, faceState: 'pending', cardState: 'pending' }
    })
    const syncRem = await prisma.participantTerminalSync.create({
      data: { participantId: partRem.id, terminalId: termA.id, faceState: 'done', cardState: 'done', removalState: 'pending' }
    })
    created.syncs.push(syncPush.id, syncRem.id)

    // --- Tokens de agente reais ---
    const { id: tokAId, token: tokenA } = await generateAgentToken({ eventId: evA.id, name: 'PC Test A' })
    const { id: tokBId, token: tokenB } = await generateAgentToken({ eventId: evB.id, name: 'PC Test B' })
    created.tokens.push(tokAId, tokBId)

    console.log(`\n=== 1) GET /terminals (token A): senha decriptada, só terminal do escopo ===`)
    const t1 = await call('GET', '/api/agent/terminals', tokenA)
    check('200', t1.status === 200, t1.status)
    check('só 1 terminal (escopo evento A)', t1.json?.terminals?.length === 1, t1.json?.terminals?.length)
    check('terminal correto é o BANCADA A', t1.json?.terminals?.[0]?.id === termA.id)
    check('senha do device veio DECRIPTADA e correta', t1.json?.terminals?.[0]?.password === PASS_A)
    check('não vaza terminal do evento B', !JSON.stringify(t1.json).includes(termB.id))

    console.log(`\n=== 2) GET /work (token A): face DECRIPTADA em claro + remoção ===`)
    const w1 = await call('GET', '/api/agent/work', tokenA)
    check('200', w1.status === 200, w1.status)
    const pushItem = w1.json?.push?.find((x: any) => x.syncId === syncPush.id)
    check('item de push presente', !!pushItem)
    check('needFace e needCard true', pushItem?.needFace === true && pushItem?.needCard === true)
    check('cardNumber entregue (9001)', pushItem?.cardNumber === '9001')
    check('FACE veio em claro (base64) e bate com o plaintext', pushItem?.face === FACE_PLAIN)
    check('employeeNo derivado do credentialNumber (distinto do cardNo)', pushItem?.employeeNo === '42', pushItem?.employeeNo)
    const remItem = w1.json?.removals?.find((x: any) => x.syncId === syncRem.id)
    check('item de remoção presente', !!remItem)

    console.log(`\n=== 3) POST /ack (token A): estado converge a partir do ack ===`)
    const a1 = await call('POST', '/api/agent/ack', tokenA, {
      acks: [
        { syncId: syncPush.id, kind: 'face', status: 'success' },
        { syncId: syncPush.id, kind: 'card', status: 'success' },
        { syncId: syncRem.id, kind: 'removal', status: 'success' }
      ]
    })
    check('200 e 3 aplicados', a1.status === 200 && a1.json?.applied === 3, a1.json)
    const afterPush = await prisma.participantTerminalSync.findUnique({ where: { id: syncPush.id } })
    const afterRem = await prisma.participantTerminalSync.findUnique({ where: { id: syncRem.id } })
    check('faceState=done, cardState=done, syncedAt setado', afterPush?.faceState === 'done' && afterPush?.cardState === 'done' && !!afterPush?.syncedAt)
    check('removalState=done, removedAt setado', afterRem?.removalState === 'done' && !!afterRem?.removedAt)
    check('attempts incrementado', (afterPush?.attempts ?? 0) >= 1)

    console.log(`\n=== 4) Isolamento de escopo: token B não enxerga evento A ===`)
    const t2 = await call('GET', '/api/agent/terminals', tokenB)
    check('/terminals token B não traz terminal de A', !JSON.stringify(t2.json).includes(termA.id))
    const w2 = await call('GET', '/api/agent/work', tokenB)
    check('/work token B vazio (não vê trabalho de A)', (w2.json?.push?.length ?? 0) === 0 && (w2.json?.removals?.length ?? 0) === 0, w2.json)
    const a2 = await call('POST', '/api/agent/ack', tokenB, { acks: [{ syncId: syncPush.id, kind: 'face', status: 'success' }] })
    check('token B NÃO consegue dar ack em linha de A (0 aplicados)', a2.json?.applied === 0, a2.json)
    const hb2 = await call('POST', '/api/agent/heartbeat', tokenB, { terminals: [{ terminalId: termA.id, online: true }] })
    check('token B NÃO toca terminal de A no heartbeat (0 updated)', hb2.json?.updated === 0, hb2.json)

    console.log(`\n=== 5) Heartbeat (token A): saúde por terminal ===`)
    const hb1 = await call('POST', '/api/agent/heartbeat', tokenA, { terminals: [{ terminalId: termA.id, online: false, error: 'timeout LAN' }] })
    check('200 e 1 updated', hb1.status === 200 && hb1.json?.updated === 1, hb1.json)
    const termAafter = await prisma.terminal.findUnique({ where: { id: termA.id } })
    check('lastSeenAt setado e lastError gravado', !!termAafter?.lastSeenAt && termAafter?.lastError === 'timeout LAN')

    console.log(`\n=== 6) Kill switch: token revogado → 401 em TODOS os /agent/* ===`)
    await revokeAgentToken(tokAId)
    const r1 = await call('GET', '/api/agent/terminals', tokenA)
    const r2 = await call('GET', '/api/agent/work', tokenA)
    const r3 = await call('POST', '/api/agent/ack', tokenA, { acks: [] })
    const r4 = await call('POST', '/api/agent/heartbeat', tokenA, { terminals: [] })
    check('GET /terminals → 401', r1.status === 401, r1.status)
    check('GET /work → 401', r2.status === 401, r2.status)
    check('POST /ack → 401', r3.status === 401, r3.status)
    check('POST /heartbeat → 401', r4.status === 401, r4.status)

    console.log(`\n=== 7) Token inexistente/ausente → 401 ===`)
    const n1 = await call('GET', '/api/agent/work', null)
    const n2 = await call('GET', '/api/agent/work', 'A'.repeat(43))
    check('sem token → 401', n1.status === 401, n1.status)
    check('token inválido → 401', n2.status === 401, n2.status)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    // limpeza (ordem respeita FKs; cascade cobre o resto)
    for (const id of created.syncs) await prisma.participantTerminalSync.deleteMany({ where: { id } })
    for (const id of created.participants) await prisma.participant.deleteMany({ where: { id } })
    for (const id of created.tokens) await prisma.agentToken.deleteMany({ where: { id } })
    for (const id of created.terminals) await prisma.terminal.deleteMany({ where: { id } })
    for (const id of created.events) await prisma.auditLog.deleteMany({ where: { eventId: id } })
    for (const id of created.events) await prisma.event.deleteMany({ where: { id } })
    await prisma.$disconnect()
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1) })
