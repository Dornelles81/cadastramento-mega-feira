/**
 * Teste F5 (sem device): versão de face ponta a ponta.
 *  - faceVersionOf: estável p/ a mesma imagem, diferente p/ outra.
 *  - /work carrega faceVersion; /ack grava em ParticipantTerminalSync.faceVersion.
 *  - re-captura (participant.faceVersion muda) → reconcile detecta (faceNeedsUpdate)
 *    e re-enfileira face+card.
 *  - enqueueFaceChange marca face+card pending imediatamente.
 * Requer o dev server no ar. Limpa tudo no fim.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { faceVersionOf } from '../lib/face/version'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { enqueueFaceChange } from '../lib/agent/sync-enqueue'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `fv-${Date.now()}`

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
const call = async (method: string, path: string, token: string, body?: any) => {
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let json: any = null; try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  try {
    console.log('=== 1) faceVersionOf ===')
    const urlA = 'data:image/jpeg;base64,/9j/AAA-' + SUF
    const urlB = 'data:image/jpeg;base64,/9j/BBB-' + SUF
    const v1 = faceVersionOf(urlA)
    check('estável p/ a mesma imagem', faceVersionOf(urlA) === v1)
    check('diferente p/ outra imagem', faceVersionOf(urlB) !== v1)

    const now = new Date()
    const ev = await prisma.event.create({ data: { name: 'FV TEST', slug: `fv-${SUF}`, code: `FV-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true } })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({ data: { eventId: ev.id, name: 'FV', ipAddress: '192.168.9.55', isActive: true, passwordEncrypted: encryptString('x') } })
    created.terminals.push(term.id)
    const p = await prisma.participant.create({ data: {
      eventId: ev.id, name: 'P FV', cpf: `${Date.now()}`.slice(-11), status: 'active', isDeleted: false, approvalStatus: 'approved',
      employeeNo: '93000001', cardNumber: '9300000000000001', faceData: encryptString(urlA), faceVersion: v1
    }})
    created.participants.push(p.id)
    const sync = await prisma.participantTerminalSync.create({ data: { participantId: p.id, terminalId: term.id, faceState: 'pending', cardState: 'pending', removalState: 'none', faceVersion: null } })
    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: 'PC fv' })
    created.tokens.push(tokId)

    console.log('\n=== 2) /work carrega faceVersion; /ack grava na linha ===')
    const w = await call('GET', '/api/agent/work', token)
    const item = w.json?.push?.find((x: any) => x.employeeNo === '93000001')
    check('push traz faceVersion = v1', item?.faceVersion === v1, item?.faceVersion?.slice(0, 12))
    await call('POST', '/api/agent/ack', token, { acks: [
      { syncId: sync.id, kind: 'face', status: 'success', faceVersion: v1 },
      { syncId: sync.id, kind: 'card', status: 'success' }
    ]})
    const afterAck = await prisma.participantTerminalSync.findUnique({ where: { id: sync.id } })
    check('linha: faceState=synced, faceVersion gravado = v1', afterAck?.faceState === 'synced' && afterAck?.faceVersion === v1)

    console.log('\n=== 3) re-captura → reconcile detecta (faceNeedsUpdate) ===')
    const v2 = faceVersionOf(urlB)
    await prisma.participant.update({ where: { id: p.id }, data: { faceData: encryptString(urlB), faceVersion: v2 } })
    // device tem o user com face (mas é a versão antiga v1)
    const rec = await call('POST', '/api/agent/reconcile', token, { terminalId: term.id, users: [{ employeeNo: '93000001', numOfFace: 1, numOfCard: 1 }] })
    check('reconcile enfileirou (pushes>=1)', (rec.json?.pushesEnqueued ?? 0) >= 1, rec.json)
    const afterRec = await prisma.participantTerminalSync.findUnique({ where: { id: sync.id } })
    check('face trocada → faceState=pending E cardState=pending (apaga+recria)', afterRec?.faceState === 'pending' && afterRec?.cardState === 'pending')

    console.log('\n=== 4) enqueueFaceChange imediato ===')
    await prisma.participantTerminalSync.update({ where: { id: sync.id }, data: { faceState: 'synced', cardState: 'synced' } })
    await enqueueFaceChange(p.id)
    const afterFc = await prisma.participantTerminalSync.findUnique({ where: { id: sync.id } })
    check('enqueueFaceChange → face+card pending', afterFc?.faceState === 'pending' && afterFc?.cardState === 'pending')

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of created.tokens) { try { await revokeAgentToken(id) } catch {} }
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}
main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
