/**
 * Teste do ESCOPO Terminal ↔ Evento (sem device, sem dev server).
 *
 * Invariante sob teste: um terminal só alcança os participantes do evento que
 * lhe está ALOCADO, dentro do período vigente. Nada vaza entre eventos.
 *
 * Cobre (os 4 obrigatórios + a assimetria da expiração):
 *   1) terminal sem alocação vigente → não seleciona ninguém
 *   2) participante de outro evento → recusa 'participante-de-outro-evento'
 *   3) participante removido do evento CORRETO → recusa 'removed'
 *      (não regride a correção do status='active')
 *   4) dois terminais, dois eventos → listas disjuntas
 *   5) expiração MARCA e NÃO apaga biometria
 *
 * Uso: node_modules/.bin/tsx scripts/test-terminal-event-scope.ts
 * Cria e apaga seus próprios dados.
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-terminal-event-scope.ts')

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { fetchSyncTarget, fetchSyncTargets } from '../lib/hikvision/sync-targets'
import { createAllocation, listPendingCleanups, markExpiredAllocations, resolveActiveAllocation } from '../lib/terminals/allocation'

const SUF = Date.now().toString().slice(-6)
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

const dia = 86400000

async function main() {
  const created: { events: string[]; terminals: string[]; participants: string[] } = { events: [], terminals: [], participants: [] }

  try {
    const now = new Date()
    let seq = 0

    const mkEvento = async (label: string) => {
      const ev = await prisma.event.create({
        data: {
          name: `ESCOPO ${label} ${SUF}`, slug: `escopo-${label}-${SUF}`, code: `ESC-${label}-${SUF}`,
          startDate: new Date(now.getTime() - 30 * dia), endDate: new Date(now.getTime() + 30 * dia),
          requiresApprovalForAccess: true
        }
      })
      created.events.push(ev.id)
      return ev
    }

    const mkTerminal = async (label: string, ip: string) => {
      const t = await prisma.terminal.create({
        data: { name: `ESCOPO ${label} ${SUF}`, ipAddress: ip, isActive: true, passwordEncrypted: encryptString('x'), fdid: '1' }
      })
      created.terminals.push(t.id)
      return t
    }

    const mkParticipante = async (eventId: string, label: string, over: Record<string, any> = {}) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId, name: `ESCOPO ${label} ${SUF}`,
          cpf: `8${SUF}${String(seq).padStart(4, '0')}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          employeeNo: `85${SUF}${seq}`.slice(-8), cardNumber: `93${SUF}${String(seq).padStart(8, '0')}`.slice(-16),
          faceData: FACE, ...over
        }
      })
      created.participants.push(p.id)
      return p
    }

    // Dois eventos, dois terminais, participantes em cada
    const evA = await mkEvento('A')
    const evB = await mkEvento('B')
    const tA = await mkTerminal('TA', `10.99.${SUF.slice(-2)}.1`)
    const tB = await mkTerminal('TB', `10.99.${SUF.slice(-2)}.2`)
    const tSem = await mkTerminal('SEM-ALOC', `10.99.${SUF.slice(-2)}.3`)

    const pA1 = await mkParticipante(evA.id, 'A1')
    const pA2 = await mkParticipante(evA.id, 'A2')
    const pARemovido = await mkParticipante(evA.id, 'A-REMOVIDO', { status: 'removed' })
    const pB1 = await mkParticipante(evB.id, 'B1')

    await createAllocation({ terminalId: tA.id, eventId: evA.id, startDate: new Date(now.getTime() - dia), endDate: new Date(now.getTime() + dia) })
    await createAllocation({ terminalId: tB.id, eventId: evB.id, startDate: new Date(now.getTime() - dia), endDate: new Date(now.getTime() + dia) })
    // terminal com alocação EXPIRADA (fora do período) — não é vigente
    const alocExpirada = await createAllocation({ terminalId: tSem.id, eventId: evA.id, startDate: new Date(now.getTime() - 10 * dia), endDate: new Date(now.getTime() - 5 * dia) })

    console.log('\n=== 1) terminal sem alocação vigente ===')
    const semAloc = await fetchSyncTargets(tSem.id)
    check('recusa com reason=sem-alocacao-vigente', !semAloc.ok && semAloc.reason === 'sem-alocacao-vigente', semAloc)
    const semAlocUm = await fetchSyncTarget(tSem.id, pA1.id)
    check('modo único também recusa (participante existe e é elegível)', !semAlocUm.ok && semAlocUm.reason === 'sem-alocacao-vigente')
    const resolvido = await resolveActiveAllocation(tSem.id)
    check('resolveActiveAllocation concorda', !resolvido.ok)

    console.log('\n=== 2) participante de outro evento ===')
    const cruzado = await fetchSyncTarget(tA.id, pB1.id)
    check('recusa com reason=participante-de-outro-evento', !cruzado.ok && cruzado.reason === 'participante-de-outro-evento', cruzado)
    const cruzadoPorEmp = await fetchSyncTarget(tB.id, pA1.employeeNo!)
    check('idem pelo employeeNo, no sentido inverso', !cruzadoPorEmp.ok && cruzadoPorEmp.reason === 'participante-de-outro-evento')

    console.log('\n=== 3) removido do evento correto (não regredir o gate crítico) ===')
    const removido = await fetchSyncTarget(tA.id, pARemovido.id)
    check('recusa com reason=removed (e não outro motivo)', !removido.ok && removido.reason === 'removed', removido)

    console.log('\n=== 4) dois terminais, listas disjuntas ===')
    const listaA = await fetchSyncTargets(tA.id)
    const listaB = await fetchSyncTargets(tB.id)
    check('A resolveu alocação', listaA.ok === true)
    check('B resolveu alocação', listaB.ok === true)
    if (listaA.ok && listaB.ok) {
      const empA = listaA.targets.map(t => t.employeeNo).sort()
      const empB = listaB.targets.map(t => t.employeeNo).sort()
      check('A vê exatamente A1+A2 (removido fora)', JSON.stringify(empA) === JSON.stringify([pA1.employeeNo, pA2.employeeNo].sort()), empA)
      check('B vê exatamente B1', JSON.stringify(empB) === JSON.stringify([pB1.employeeNo]), empB)
      check('interseção vazia — nada vaza entre eventos', empA.every(e => !empB.includes(e)))
      check('A não enxerga participante de B', !empA.includes(pB1.employeeNo!))
      check('evento reportado em A é o alocado', listaA.allocation.eventId === evA.id)
    }

    console.log('\n=== 5) expiração MARCA, não apaga ===')
    const faceAntes = await prisma.participant.findUnique({ where: { id: pA1.id }, select: { faceData: true, employeeNo: true, status: true } })
    const marcadas = await markExpiredAllocations()
    const alvo = marcadas.find(a => a.id === alocExpirada.id)
    check('alocação vencida foi marcada como expirada', !!alvo, marcadas.length)
    const depois = await prisma.terminalEvent.findUnique({ where: { id: alocExpirada.id }, select: { expiredAt: true, pendingCleanup: true, cleanedAt: true } })
    check('expiredAt preenchido', !!depois?.expiredAt)
    check('pendingCleanup levantado (bandeira p/ o admin)', depois?.pendingCleanup === true)
    check('cleanedAt continua nulo (remoção não foi automática)', depois?.cleanedAt === null)

    const faceDepois = await prisma.participant.findUnique({ where: { id: pA1.id }, select: { faceData: true, employeeNo: true, status: true } })
    check('NENHUMA biometria foi apagada pela expiração', !!faceDepois?.faceData && faceDepois.faceData.length === faceAntes!.faceData!.length)
    check('employeeNo intacto', faceDepois?.employeeNo === faceAntes?.employeeNo)
    check('status intacto', faceDepois?.status === faceAntes?.status)

    const pendentes = await listPendingCleanups()
    check('aparece na lista de limpezas pendentes do admin', pendentes.some(p => p.id === alocExpirada.id))

    const idempotente = await markExpiredAllocations()
    check('varredura é idempotente (não re-marca)', !idempotente.some(a => a.id === alocExpirada.id))

    console.log('\n=== 6) sobreposição de período é barrada ===')
    let barrou = false
    try {
      await createAllocation({ terminalId: tA.id, eventId: evB.id, startDate: new Date(now.getTime() - dia), endDate: new Date(now.getTime() + dia) })
    } catch { barrou = true }
    check('alocação sobreposta no mesmo terminal foi rejeitada', barrou)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
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
