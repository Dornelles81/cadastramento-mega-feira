/**
 * Teste do fan-out do sync (Fase 2). Exercita lib/agent/sync-enqueue contra o
 * DB + os endpoints /api/agent/{work,ack} reais:
 *  - enqueueForContext idempotente (2x não duplica) e NÃO enfileira terminal inativo
 *  - backfillTerminal não duplica linha existente e cobre o roster
 *  - ciclo: enqueue → /work serve → ack → synced; enqueueRemoval → /work → ack → removed
 *  - revive: re-enqueue de quem estava em remoção volta a push
 * Limpa tudo no fim. Requer o dev server no ar (http://localhost:3000).
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { enqueueForContext, enqueueRemoval, backfillTerminal } from '../lib/agent/sync-enqueue'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `fanout-${Date.now()}`
const FACE_PLAIN = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
async function call(method: string, path: string, token: string | null, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  let json: any = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}
const rowsOf = (pid: string) => prisma.participantTerminalSync.findMany({ where: { participantId: pid } })

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: { name: 'FANOUT TEST', slug: `f-${SUF}`, code: `F-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true }
    })
    created.events.push(ev.id)

    // Terminal ATIVO + terminal INATIVO (mesmo evento)
    const termActive = await prisma.terminal.create({ data: { eventId: ev.id, name: 'ATIVO', ipAddress: '192.168.9.10', isActive: true, passwordEncrypted: encryptString('x') } })
    const termInactive = await prisma.terminal.create({ data: { eventId: ev.id, name: 'INATIVO', ipAddress: '192.168.9.11', isActive: false, passwordEncrypted: encryptString('x') } })
    created.terminals.push(termActive.id, termInactive.id)

    // Participantes elegíveis (active + approved + face + employeeNo)
    const mkP = async (n: number) => prisma.participant.create({
      data: {
        eventId: ev.id, name: `P${n} ${SUF}`, cpf: `${n}${Date.now()}`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved',
        employeeNo: `9500000${n}`, cardNumber: `9500000000000${n}`, faceData: encryptString(FACE_PLAIN)
      }
    })
    const p1 = await mkP(1)
    const p2 = await mkP(2)
    created.participants.push(p1.id, p2.id)

    console.log('\n=== 1) enqueueForContext idempotente + não enfileira terminal inativo ===')
    await enqueueForContext(ev.id, p1.id)
    await enqueueForContext(ev.id, p1.id) // 2ª vez não pode duplicar
    let r1 = await rowsOf(p1.id)
    check('P1 tem exatamente 1 linha (sem duplicar em 2 enqueues)', r1.length === 1, r1.length)
    check('a linha é do terminal ATIVO (inativo não entra)', r1[0]?.terminalId === termActive.id)
    check('face/cardState=pending, removalState=none', r1[0]?.faceState === 'pending' && r1[0]?.cardState === 'pending' && r1[0]?.removalState === 'none')
    const noInactive = await prisma.participantTerminalSync.count({ where: { terminalId: termInactive.id } })
    check('nenhuma linha no terminal inativo', noInactive === 0, noInactive)

    console.log('\n=== 2) backfillTerminal não duplica e cobre o roster ===')
    await backfillTerminal(termActive.id)
    r1 = await rowsOf(p1.id)
    const r2 = await rowsOf(p2.id)
    check('P1 continua com 1 linha (backfill não duplicou)', r1.length === 1, r1.length)
    check('P2 ganhou 1 linha no backfill (roster coberto)', r2.length === 1, r2.length)

    // --- token de agente p/ exercitar /work e /ack ---
    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: 'PC fanout' })
    created.tokens.push(tokId)

    console.log('\n=== 3) /work serve push com employeeNo + validEnd; sem itens do inativo ===')
    const w = await call('GET', '/api/agent/work', token)
    const pushP1 = w.json?.push?.find((x: any) => x.employeeNo === '95000001')
    const pushP2 = w.json?.push?.find((x: any) => x.employeeNo === '95000002')
    check('/work 200', w.status === 200)
    check('P1 e P2 no push', !!pushP1 && !!pushP2)
    check('validEnd=2037 no push', pushP1?.validEnd === '2037-12-31T23:59:59', pushP1?.validEnd)
    check('todos os itens são do terminal ATIVO', (w.json?.push ?? []).every((x: any) => x.terminalId === termActive.id))

    console.log('\n=== 4) ack success → synced ===')
    const syncId1 = r1[0].id
    await call('POST', '/api/agent/ack', token, { acks: [
      { syncId: syncId1, kind: 'face', status: 'success' },
      { syncId: syncId1, kind: 'card', status: 'success' }
    ]})
    const afterAck = await prisma.participantTerminalSync.findUnique({ where: { id: syncId1 } })
    check('P1 faceState=synced, cardState=synced, syncedAt setado', afterAck?.faceState === 'synced' && afterAck?.cardState === 'synced' && !!afterAck?.syncedAt)

    console.log('\n=== 5) enqueueRemoval → /work serve removal → ack → removed ===')
    await enqueueRemoval(p1.id)
    const afterRemEnq = await prisma.participantTerminalSync.findUnique({ where: { id: syncId1 } })
    check('removalState=pending após enqueueRemoval', afterRemEnq?.removalState === 'pending')
    const w2 = await call('GET', '/api/agent/work', token)
    const remP1 = w2.json?.removals?.find((x: any) => x.employeeNo === '95000001')
    check('P1 aparece em removals com employeeNo', remP1?.employeeNo === '95000001', remP1?.employeeNo)
    await call('POST', '/api/agent/ack', token, { acks: [ { syncId: syncId1, kind: 'removal', status: 'success' } ] })
    const afterRemAck = await prisma.participantTerminalSync.findUnique({ where: { id: syncId1 } })
    check('removalState=removed, removedAt setado', afterRemAck?.removalState === 'removed' && !!afterRemAck?.removedAt)

    console.log('\n=== 6) revive: re-enqueue de quem estava em remoção volta a push ===')
    await enqueueForContext(ev.id, p1.id)
    const revived = await prisma.participantTerminalSync.findUnique({ where: { id: syncId1 } })
    check('removalState=none, face/cardState=pending (revivido)', revived?.removalState === 'none' && revived?.faceState === 'pending' && revived?.cardState === 'pending')

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    // limpeza (ordem: syncs caem por cascade ao deletar participantes/terminais)
    for (const id of created.tokens) { try { await revokeAgentToken(id) } catch {} }
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}
main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
