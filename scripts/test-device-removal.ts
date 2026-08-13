/**
 * Teste do caminho de REMOÇÃO NO DEVICE que sobrevive ao hard delete (LGPD).
 *
 * O buraco que este caminho fecha: `ParticipantTerminalSync` tem
 * `onDelete: Cascade` para `Participant`. Apagar o participante destruía a
 * linha que serviria para tirar a face do terminal — o painel confirmava a
 * exclusão e o rosto continuava na catraca. `PendingDeviceRemoval` não
 * referencia `Participant` justamente para sobreviver a esse delete.
 *
 * ESTE CAMINHO É LGPD: se regredir, alguém pede exclusão, o sistema confirma, e
 * a biometria continua abrindo a porta. Por isso os quatro casos abaixo.
 *
 *   1) a pendência SOBREVIVE ao delete do participante (o cascade não a leva)
 *   2) /work SERVE a pendência mesmo com ALOCAÇÃO VENCIDA
 *      (o pedido de exclusão costuma chegar depois que a feira acabou)
 *   3) /ack marca removedAt e a pendência PARA de ser servida
 *   4) idempotência: enfileirar duas vezes não duplica; re-pedir REABRE
 *
 * NÃO toca device nenhum: exercita só o lado nuvem (Prisma + /work + /ack).
 * Uso: node_modules/.bin/tsx scripts/test-device-removal.ts
 * Requer o dev server no ar (http://localhost:3000). Limpa tudo no fim.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { createAllocation } from '../lib/terminals/allocation'
import { enqueueDeviceRemovalBeforeDelete } from '../lib/agent/device-removal'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = Date.now().toString().slice(-6)
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)
const dia = 86400000

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}
async function call(method: string, path: string, token: string, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  let json: any = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], tokens: [] }
  let seq = 0

  try {
    const now = new Date()

    const ev = await prisma.event.create({
      data: {
        name: `PDR TEST ${SUF}`, slug: `pdr-${SUF}`, code: `PDR-${SUF}`,
        startDate: new Date(now.getTime() - 30 * dia), endDate: new Date(now.getTime() + 30 * dia),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)

    const term = await prisma.terminal.create({
      data: { name: `PDR ${SUF}`, ipAddress: `10.77.${SUF.slice(-2)}.1`, isActive: true, passwordEncrypted: encryptString('x') }
    })
    created.terminals.push(term.id)

    // Alocação VIGENTE por enquanto — o caso 2 vai vencê-la de propósito.
    const aloc = await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - dia), endDate: new Date(now.getTime() + dia)
    })

    const mkParticipante = async (label: string) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `PDR ${label} ${SUF}`,
          cpf: `6${SUF}${String(seq).padStart(4, '0')}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          employeeNo: `64${SUF}${seq}`.slice(-8),
          cardNumber: `65${SUF}${String(seq).padStart(8, '0')}`.slice(-16),
          faceData: FACE
        }
      })
      created.participants.push(p.id)
      await prisma.participantTerminalSync.create({
        data: { participantId: p.id, terminalId: term.id, faceState: 'synced', cardState: 'synced', removalState: 'none' }
      })
      return p
    }

    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: `PDR ${SUF}` })
    created.tokens.push(tokId)

    // ------------------------------------------------------------------ caso 1
    console.log('\n=== 1) a pendência SOBREVIVE ao hard delete (cascade não a leva) ===')
    const pA = await mkParticipante('A')
    const empA = pA.employeeNo!

    const enfileirado = await enqueueDeviceRemovalBeforeDelete(pA.id)
    check('enqueue devolveu o employeeNo e o terminal', enfileirado?.employeeNo === empA && enfileirado?.terminalIds.includes(term.id), enfileirado)

    const antesDelete = await prisma.pendingDeviceRemoval.findUnique({
      where: { employeeNo_terminalId: { employeeNo: empA, terminalId: term.id } }
    })
    check('pendência criada antes do delete', !!antesDelete && antesDelete.removedAt === null)

    await prisma.participant.delete({ where: { id: pA.id } })

    const syncSumiu = await prisma.participantTerminalSync.count({ where: { participantId: pA.id } })
    check('cascade APAGOU a linha de sync (é o problema que motiva tudo isso)', syncSumiu === 0, syncSumiu)

    const depoisDelete = await prisma.pendingDeviceRemoval.findUnique({
      where: { employeeNo_terminalId: { employeeNo: empA, terminalId: term.id } }
    })
    check('a PENDÊNCIA continua de pé após o participante deixar de existir', !!depoisDelete, depoisDelete?.id)
    check('e guarda só o identificador técnico (nenhum dado pessoal)', depoisDelete
      ? !Object.keys(depoisDelete).some(k => ['name', 'cpf', 'email', 'phone', 'faceData'].includes(k))
      : false, depoisDelete ? Object.keys(depoisDelete) : null)

    const participanteSumiu = await prisma.participant.findUnique({ where: { id: pA.id } })
    check('participante realmente não existe mais', participanteSumiu === null)

    // ------------------------------------------------------------------ caso 2
    console.log('\n=== 2) /work SERVE a pendência mesmo com ALOCAÇÃO VENCIDA ===')
    // Vence a alocação: é o cenário real — pedido de exclusão chega depois da feira.
    await prisma.terminalEvent.update({
      where: { id: aloc.id },
      data: { startDate: new Date(now.getTime() - 10 * dia), endDate: new Date(now.getTime() - 5 * dia) }
    })

    const w1 = await call('GET', '/api/agent/work', token)
    check('/work 200', w1.status === 200, w1.status)
    const itemA = (w1.json?.removals ?? []).find((x: any) => x.employeeNo === empA)
    check('a remoção é servida APESAR da alocação vencida', !!itemA, w1.json?.removals)
    check('vem com o prefixo pdr: (para o /ack achar a tabela certa)', typeof itemA?.syncId === 'string' && itemA.syncId.startsWith('pdr:'), itemA?.syncId)
    check('PUSH está vazio (fora do período não se sincroniza ninguém)', (w1.json?.push ?? []).length === 0, w1.json?.push?.length)

    // ------------------------------------------------------------------ caso 3
    console.log('\n=== 3) /ack marca removedAt e a pendência sai da fila ===')
    const a1 = await call('POST', '/api/agent/ack', token, {
      acks: [{ syncId: itemA.syncId, kind: 'removal', status: 'success' }]
    })
    check('/ack 200', a1.status === 200, a1.status)

    const confirmada = await prisma.pendingDeviceRemoval.findUnique({
      where: { employeeNo_terminalId: { employeeNo: empA, terminalId: term.id } }
    })
    check('removedAt preenchido — prova de que a face saiu do device', !!confirmada?.removedAt, confirmada?.removedAt)
    check('attempts incrementado', (confirmada?.attempts ?? 0) === 1, confirmada?.attempts)

    const w2 = await call('GET', '/api/agent/work', token)
    check('/work NÃO serve mais a pendência confirmada', !(w2.json?.removals ?? []).some((x: any) => x.employeeNo === empA), w2.json?.removals)

    // Falha do agente NÃO pode marcar como removida.
    const pB = await mkParticipante('B')
    const empB = pB.employeeNo!
    await enqueueDeviceRemovalBeforeDelete(pB.id)
    await prisma.participant.delete({ where: { id: pB.id } })
    const w3 = await call('GET', '/api/agent/work', token)
    const itemB = (w3.json?.removals ?? []).find((x: any) => x.employeeNo === empB)
    check('pendência de B servida', !!itemB)
    await call('POST', '/api/agent/ack', token, {
      acks: [{ syncId: itemB.syncId, kind: 'removal', status: 'failed', error: 'device offline' }]
    })
    const bFalhou = await prisma.pendingDeviceRemoval.findUnique({
      where: { employeeNo_terminalId: { employeeNo: empB, terminalId: term.id } }
    })
    check('ack FAILED NÃO marca removedAt (sem prova, sem baixa)', bFalhou?.removedAt === null, bFalhou?.removedAt)
    check('lastError registrado', bFalhou?.lastError === 'device offline', bFalhou?.lastError)
    const w4 = await call('GET', '/api/agent/work', token)
    check('pendência que falhou CONTINUA na fila (será tentada de novo)', (w4.json?.removals ?? []).some((x: any) => x.employeeNo === empB))

    // ------------------------------------------------------------------ caso 4
    console.log('\n=== 4) idempotência: não duplica; re-pedido REABRE ===')
    const pC = await mkParticipante('C')
    const empC = pC.employeeNo!
    await enqueueDeviceRemovalBeforeDelete(pC.id)
    await enqueueDeviceRemovalBeforeDelete(pC.id) // 2ª vez
    const quantasC = await prisma.pendingDeviceRemoval.count({ where: { employeeNo: empC, terminalId: term.id } })
    check('dois enqueues geram UMA linha só', quantasC === 1, quantasC)

    // Re-pedido depois de concluída: reabre (caso a pessoa volte ao device).
    await prisma.pendingDeviceRemoval.update({
      where: { employeeNo_terminalId: { employeeNo: empC, terminalId: term.id } },
      data: { removedAt: new Date(), attempts: 3, lastError: 'antigo' }
    })
    await enqueueDeviceRemovalBeforeDelete(pC.id)
    const reaberta = await prisma.pendingDeviceRemoval.findUnique({
      where: { employeeNo_terminalId: { employeeNo: empC, terminalId: term.id } }
    })
    check('re-pedido zera removedAt (reabre a pendência)', reaberta?.removedAt === null, reaberta?.removedAt)
    check('re-pedido zera attempts e lastError', reaberta?.attempts === 0 && reaberta?.lastError === null, { a: reaberta?.attempts, e: reaberta?.lastError })

    // Sem employeeNo não há o que remover no device.
    const semEmp = await prisma.participant.create({
      data: {
        eventId: ev.id, name: `PDR SEM-EMP ${SUF}`, cpf: `69${SUF}0000`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'pending'
      }
    })
    created.participants.push(semEmp.id)
    const nada = await enqueueDeviceRemovalBeforeDelete(semEmp.id)
    check('participante SEM employeeNo não gera pendência (nunca chegou a device)', nada === null, nada)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of created.tokens) { try { await revokeAgentToken(id) } catch {} }
    await prisma.pendingDeviceRemoval.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
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
