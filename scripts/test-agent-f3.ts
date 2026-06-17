/**
 * Teste F3 (sem device): valida o DRY-RUN do agente e o backoff/retry do /work.
 *  - runOnce(dryRun) planeja addUser+uploadFace+registerCard a partir do /work,
 *    SEM escrever no terminal (não toca o device).
 *  - /work re-serve linha `failed` só após o backoff e abaixo do teto de tentativas.
 * A escrita real no device é o teste de bancada (separado, com aprovação).
 * Requer o dev server no ar. Limpa tudo no fim.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { runOnce } from '../agent/agent'
import type { AgentConfig } from '../agent/config'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `f3-${Date.now()}`
const FACE_PLAIN = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
async function getWork(token: string) {
  const res = await fetch(`${BASE}/api/agent/work`, { headers: { Authorization: `Bearer ${token}` } })
  let json: any = null; try { json = await res.json() } catch {}
  return json
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: { name: 'F3 TEST', slug: `f3-${SUF}`, code: `F3-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true }
    })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({
      data: { eventId: ev.id, name: 'BANCADA F3', ipAddress: '192.168.9.99', isActive: true, passwordEncrypted: encryptString('x') }
    })
    created.terminals.push(term.id)
    const p = await prisma.participant.create({
      data: {
        eventId: ev.id, name: 'P F3', cpf: `${Date.now()}`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved',
        employeeNo: '96000001', cardNumber: '9600000000000001', faceData: encryptString(FACE_PLAIN)
      }
    })
    created.participants.push(p.id)
    const sync = await prisma.participantTerminalSync.create({
      data: { participantId: p.id, terminalId: term.id, faceState: 'pending', cardState: 'pending', removalState: 'none' }
    })
    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: 'PC F3' })
    created.tokens.push(tokId)
    const cfg: AgentConfig = { baseUrl: BASE, token, pollMs: 5000, workLimit: 50 }

    console.log('\n=== 1) DRY-RUN: planeja addUser+uploadFace+registerCard, sem escrever ===')
    const r = await runOnce(cfg, { dryRun: true })
    const line = r.planned.find(l => l.includes('emp=96000001'))
    check('plano tem PUSH do emp 96000001', !!line, line)
    check('plano: addUser ANTES de uploadFace+registerCard', line?.includes('[addUser+uploadFace+registerCard]') === true)
    check('plano traz validEnd=2037', line?.includes('validEnd=2037-12-31T23:59:59') === true)
    check('dry-run NÃO aplicou nada (applied=0, failed=0)', r.applied === 0 && r.failed === 0)

    console.log('\n=== 2) backoff: linha failed RECENTE não é re-servida ===')
    await prisma.participantTerminalSync.update({
      where: { id: sync.id },
      data: { faceState: 'failed', cardState: 'synced', removalState: 'none', attempts: 1, lastAttemptAt: new Date() }
    })
    let w = await getWork(token)
    let item = w?.push?.find((x: any) => x.employeeNo === '96000001')
    check('linha failed recente NÃO aparece no /work (dentro do backoff)', !item)

    console.log('\n=== 3) backoff: linha failed ANTIGA é re-servida (needFace) ===')
    await prisma.participantTerminalSync.update({
      where: { id: sync.id },
      data: { lastAttemptAt: new Date(Date.now() - 5 * 60_000) } // 5 min atrás
    })
    w = await getWork(token)
    item = w?.push?.find((x: any) => x.employeeNo === '96000001')
    check('linha failed antiga aparece no /work', !!item)
    check('needFace=true (retry do face), needCard=false (já synced)', item?.needFace === true && item?.needCard === false)

    console.log('\n=== 4) teto de tentativas: failed antiga mas attempts>=MAX não é re-servida ===')
    await prisma.participantTerminalSync.update({
      where: { id: sync.id },
      data: { attempts: 8, lastAttemptAt: new Date(Date.now() - 5 * 60_000) }
    })
    w = await getWork(token)
    item = w?.push?.find((x: any) => x.employeeNo === '96000001')
    check('attempts>=8 NÃO é re-servida (teto)', !item)

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
