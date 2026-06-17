/**
 * Teste F4 (sem device): valida o diff da reconciliação (/api/agent/reconcile)
 * e a PAGINAÇÃO do lister do agente.
 *  - faltando → push; órfão-com-linha → removal; órfão-sem-linha → removeEmployeeNos;
 *    incompleto (numOfFace=0) → re-enfileira só o face; em-sync → nada.
 *  - listDeviceRoster pagina 30/página e coleta TODOS (mock >30) — anti-loop.
 * Requer o dev server no ar. Limpa tudo no fim.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { listDeviceRoster } from '../agent/reconcile'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `rec-${Date.now()}`
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({ data: { name: 'REC TEST', slug: `r-${SUF}`, code: `R-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true } })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({ data: { eventId: ev.id, name: 'REC', ipAddress: '192.168.9.77', isActive: true, passwordEncrypted: encryptString('x') } })
    created.terminals.push(term.id)

    const mkP = async (emp: string, opts: { eligible: boolean } = { eligible: true }) => {
      const p = await prisma.participant.create({ data: {
        eventId: ev.id, name: `P${emp}`, cpf: `${emp}${Date.now()}`.slice(-11),
        status: opts.eligible ? 'active' : 'removed', isDeleted: false,
        approvalStatus: 'approved', employeeNo: emp, cardNumber: `94000000000000${emp.slice(-1)}`, faceData: FACE
      }})
      created.participants.push(p.id)
      await prisma.participantTerminalSync.create({ data: { participantId: p.id, terminalId: term.id, faceState: 'synced', cardState: 'synced', removalState: 'none' } })
      return p
    }
    const pSynced = await mkP('94000001')         // no device, completo -> nada
    const pMissing = await mkP('94000002')        // NAO no device -> push
    const pIncompl = await mkP('94000003')        // no device, numOfFace=0 -> face
    const pOrphan = await mkP('94000004', { eligible: false }) // inelegivel, no device, com linha -> removal

    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: 'PC rec' })
    created.tokens.push(tokId)

    // roster "real" reportado (94000002 ausente; 94999999 = orfao sem participante)
    const users = [
      { employeeNo: '94000001', numOfFace: 1, numOfCard: 1 },
      { employeeNo: '94000003', numOfFace: 0, numOfCard: 1 },
      { employeeNo: '94000004', numOfFace: 1, numOfCard: 1 },
      { employeeNo: '94999999', numOfFace: 1, numOfCard: 1 }
    ]

    console.log('\n=== 1) POST /reconcile: diff ===')
    const res = await fetch(`${BASE}/api/agent/reconcile`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ terminalId: term.id, users }) })
    const r = await res.json()
    check('200', res.status === 200, res.status)
    check('pushesEnqueued=2 (faltando + incompleto)', r.pushesEnqueued === 2, r.pushesEnqueued)
    check('removalsEnqueued=1 (orfao com linha)', r.removalsEnqueued === 1, r.removalsEnqueued)
    check('removeEmployeeNos=[94999999] (orfao sem linha)', JSON.stringify(r.removeEmployeeNos) === '["94999999"]', r.removeEmployeeNos)

    const rowOf = (pid: string) => prisma.participantTerminalSync.findFirst({ where: { participantId: pid } })
    const rm = await rowOf(pMissing.id), ri = await rowOf(pIncompl.id), ro = await rowOf(pOrphan.id), rs = await rowOf(pSynced.id)
    console.log('\n=== 2) estados no banco ===')
    check('faltando: faceState+cardState=pending', rm?.faceState === 'pending' && rm?.cardState === 'pending')
    check('incompleto: faceState=pending, cardState=synced (so o kind faltante)', ri?.faceState === 'pending' && ri?.cardState === 'synced')
    check('orfao-com-linha: removalState=pending', ro?.removalState === 'pending')
    check('em-sync: intacto (synced/synced/none)', rs?.faceState === 'synced' && rs?.cardState === 'synced' && rs?.removalState === 'none')

    console.log('\n=== 3) paginacao do lister (mock >30) ===')
    const fake = Array.from({ length: 65 }, (_, i) => ({ employeeNo: String(90000000 + i), numOfFace: 1, numOfCard: 1 }))
    const mock = { searchUsers: async (_e?: string, pos = 0, max = 30) => ({ UserInfoSearch: { totalMatches: 65, numOfMatches: Math.min(max, 65 - pos), UserInfo: fake.slice(pos, pos + max) } }) }
    const roster = await listDeviceRoster(mock)
    check('coletou TODOS os 65 (paginou, nao truncou em 30)', roster.length === 65, roster.length)
    check('ultimo emp correto (90000064)', roster[64]?.employeeNo === '90000064', roster[64]?.employeeNo)

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
