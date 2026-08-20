/**
 * Teste do ESCOPO POR ALOCAÇÃO nos consumidores do sync (Fase 2).
 *
 * O `test-terminal-event-scope.ts` já cobre a alocação no caminho de BANCADA
 * (lib/hikvision/sync-targets). Este cobre o caminho da NUVEM — o fan-out
 * (`sync-enqueue`), o `/api/agent/work` e a reconciliação —, que até agora liam
 * `Terminal.eventId` e ignoravam o período.
 *
 * Invariante: o período da alocação (startDate/endDate) tem efeito real sobre o
 * que é sincronizado.
 *
 *   1) alocação EXPIRADA (endDate no passado) → não sincroniza ninguém
 *   2) alocação FUTURA (startDate à frente)   → não sincroniza ninguém
 *   3) dois terminais, dois eventos vigentes  → listas disjuntas
 *   4) TRAVA: reconciliação sem alocação vigente é NO-OP, nunca remoção em massa
 *
 * Uso: node_modules/.bin/tsx scripts/test-allocation-scope.ts
 * Requer o dev server no ar para o /work (http://localhost:3000).
 * Cria e apaga seus próprios dados.
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-allocation-scope.ts')

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { enqueueForContext, backfillTerminal } from '../lib/agent/sync-enqueue'
import { reconcileTerminal } from '../lib/agent/reconcile'
import { createAllocation, listAllocatedTerminalIds } from '../lib/terminals/allocation'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = Date.now().toString().slice(-6)
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)
const dia = 86400000

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  let seq = 0

  try {
    const now = new Date()

    const mkEvento = async (label: string) => {
      const ev = await prisma.event.create({
        data: {
          name: `ALOC ${label} ${SUF}`, slug: `aloc-${label}-${SUF}`, code: `AL-${label}-${SUF}`,
          startDate: new Date(now.getTime() - 30 * dia), endDate: new Date(now.getTime() + 30 * dia),
          requiresApprovalForAccess: true
        }
      })
      created.events.push(ev.id)
      return ev
    }
    const mkTerminal = async (label: string, ip: string) => {
      const t = await prisma.terminal.create({
        data: { name: `ALOC ${label} ${SUF}`, ipAddress: ip, isActive: true, passwordEncrypted: encryptString('x'), fdid: '1' }
      })
      created.terminals.push(t.id)
      return t
    }
    const mkParticipante = async (eventId: string, label: string) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId, name: `ALOC ${label} ${SUF}`,
          cpf: `7${SUF}${String(seq).padStart(4, '0')}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          employeeNo: `75${SUF}${seq}`.slice(-8),
          cardNumber: `73${SUF}${String(seq).padStart(8, '0')}`.slice(-16),
          faceData: FACE
        }
      })
      created.participants.push(p.id)
      return p
    }
    const rowsOf = (pid: string) => prisma.participantTerminalSync.findMany({ where: { participantId: pid } })

    // ---------------------------------------------------------------- 1) EXPIRADA
    console.log('\n=== 1) alocação EXPIRADA (endDate no passado) → não sincroniza ninguém ===')
    const evExp = await mkEvento('EXP')
    const tExp = await mkTerminal('T-EXP', `10.88.${SUF.slice(-2)}.1`)
    const pExp = await mkParticipante(evExp.id, 'P-EXP')
    await createAllocation({
      terminalId: tExp.id, eventId: evExp.id,
      startDate: new Date(now.getTime() - 10 * dia), endDate: new Date(now.getTime() - 5 * dia)
    })

    const alocExp = await listAllocatedTerminalIds(evExp.id)
    check('listAllocatedTerminalIds não devolve o terminal expirado', alocExp.length === 0, alocExp)

    await enqueueForContext(evExp.id, pExp.id)
    const linhasExp = await rowsOf(pExp.id)
    check('enqueueForContext NÃO criou linha (fora do período)', linhasExp.length === 0, linhasExp.length)

    await backfillTerminal(tExp.id)
    const backfillExp = await prisma.participantTerminalSync.count({ where: { terminalId: tExp.id } })
    check('backfillTerminal NÃO criou linha (fora do período)', backfillExp === 0, backfillExp)

    // ---------------------------------------------------------------- 2) FUTURA
    console.log('\n=== 2) alocação FUTURA (startDate à frente) → não sincroniza ninguém ===')
    const evFut = await mkEvento('FUT')
    const tFut = await mkTerminal('T-FUT', `10.88.${SUF.slice(-2)}.2`)
    const pFut = await mkParticipante(evFut.id, 'P-FUT')
    await createAllocation({
      terminalId: tFut.id, eventId: evFut.id,
      startDate: new Date(now.getTime() + 5 * dia), endDate: new Date(now.getTime() + 10 * dia)
    })

    const alocFut = await listAllocatedTerminalIds(evFut.id)
    check('listAllocatedTerminalIds não devolve o terminal futuro', alocFut.length === 0, alocFut)

    await enqueueForContext(evFut.id, pFut.id)
    check('enqueueForContext NÃO criou linha (período ainda não começou)', (await rowsOf(pFut.id)).length === 0)

    await backfillTerminal(tFut.id)
    const backfillFut = await prisma.participantTerminalSync.count({ where: { terminalId: tFut.id } })
    check('backfillTerminal NÃO criou linha (período ainda não começou)', backfillFut === 0, backfillFut)

    // ------------------------------------------------- 3) DOIS EVENTOS VIGENTES
    console.log('\n=== 3) dois terminais, dois eventos vigentes → listas disjuntas ===')
    const evA = await mkEvento('A')
    const evB = await mkEvento('B')
    const tA = await mkTerminal('T-A', `10.88.${SUF.slice(-2)}.3`)
    const tB = await mkTerminal('T-B', `10.88.${SUF.slice(-2)}.4`)
    const pA = await mkParticipante(evA.id, 'P-A')
    const pB = await mkParticipante(evB.id, 'P-B')
    for (const [t, ev] of [[tA, evA], [tB, evB]] as const) {
      await createAllocation({
        terminalId: t.id, eventId: ev.id,
        startDate: new Date(now.getTime() - dia), endDate: new Date(now.getTime() + dia)
      })
    }

    await enqueueForContext(evA.id, pA.id)
    await enqueueForContext(evB.id, pB.id)
    const linhasA = await rowsOf(pA.id)
    const linhasB = await rowsOf(pB.id)
    check('P-A ganhou linha SÓ no terminal A', linhasA.length === 1 && linhasA[0].terminalId === tA.id, linhasA.map(r => r.terminalId))
    check('P-B ganhou linha SÓ no terminal B', linhasB.length === 1 && linhasB[0].terminalId === tB.id, linhasB.map(r => r.terminalId))
    check('nada vazou: A não tem linha de P-B', !linhasB.some(r => r.terminalId === tA.id))

    // /work com token do evento A só pode ver o terminal A
    const { id: tokA, token: tokenA } = await generateAgentToken({ eventId: evA.id, name: `ALOC A ${SUF}` })
    created.tokens.push(tokA)
    const wA = await fetch(`${BASE}/api/agent/work`, { headers: { Authorization: `Bearer ${tokenA}` } })
    const jA = await wA.json()
    const idsServidos = [...(jA.push ?? []), ...(jA.removals ?? [])].map((x: any) => x.terminalId)
    check('/work 200', wA.status === 200, wA.status)
    check('/work só serve itens do terminal A', idsServidos.every((id: string) => id === tA.id), [...new Set(idsServidos)])
    check('/work NÃO serve nada do terminal B', !idsServidos.includes(tB.id))

    // /work pedindo explicitamente um terminal FORA do escopo devolve vazio
    const wCruz = await fetch(`${BASE}/api/agent/work?terminalId=${tB.id}`, { headers: { Authorization: `Bearer ${tokenA}` } })
    const jCruz = await wCruz.json()
    check('/work?terminalId=<de outro evento> devolve vazio', (jCruz.push ?? []).length === 0 && (jCruz.removals ?? []).length === 0, jCruz)

    // /work de um evento cujo terminal está EXPIRADO não serve nada
    const { id: tokExp, token: tokenExp } = await generateAgentToken({ eventId: evExp.id, name: `ALOC EXP ${SUF}` })
    created.tokens.push(tokExp)
    const wExp = await fetch(`${BASE}/api/agent/work`, { headers: { Authorization: `Bearer ${tokenExp}` } })
    const jExp = await wExp.json()
    check('/work do evento com alocação expirada devolve vazio', (jExp.push ?? []).length === 0 && (jExp.removals ?? []).length === 0, jExp)

    // ------------------------------------------- 4) TRAVA anti-remoção-em-massa
    console.log('\n=== 4) TRAVA: reconciliação sem alocação vigente é NO-OP ===')
    // O device reporta gente; sem alocação vigente, TODOS pareceriam órfãos.
    const rosterFalso = [
      { employeeNo: '79999901', numOfFace: 1, numOfCard: 1 },
      { employeeNo: '79999902', numOfFace: 1, numOfCard: 1 }
    ]
    const recExp = await reconcileTerminal(tExp.id, rosterFalso)
    check('skipped=sem-alocacao-vigente', recExp.skipped === 'sem-alocacao-vigente', recExp.skipped)
    check('removeEmployeeNos VAZIO (não mandou apagar ninguém)', recExp.removeEmployeeNos.length === 0, recExp.removeEmployeeNos)
    check('removalsEnqueued=0', recExp.removalsEnqueued === 0, recExp.removalsEnqueued)
    check('pushesEnqueued=0', recExp.pushesEnqueued === 0, recExp.pushesEnqueued)

    // Controle: com alocação vigente, a reconciliação VOLTA a agir (a trava não
    // é "nunca reconciliar", é "não reconciliar fora do período").
    const recA = await reconcileTerminal(tA.id, [{ employeeNo: '79999903', numOfFace: 1, numOfCard: 1 }])
    check('com alocação vigente NÃO pula', recA.skipped === undefined, recA.skipped)
    check('e volta a apontar o órfão real', recA.removeEmployeeNos.includes('79999903'), recA.removeEmployeeNos)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of created.tokens) { try { await revokeAgentToken(id) } catch {} }
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch(e => {
  console.error('ERRO:', e?.message)
  process.exit(1)
})
