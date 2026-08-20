/**
 * Teste do FILTRO CRÍTICO do sync facial (sem device, sem dev server).
 *
 * Invariante sob teste: participante REMOVIDO nunca vai para o terminal.
 * Sem isso, o sync recadastra quem foi excluído e reabre o acesso físico.
 *
 * Cobre:
 *   1) seleção em massa (--all) ignora status='removed' e isDeleted=true
 *   2) modo participante único RECUSA o removido pedido explicitamente pelo id
 *      — e o script REAL, executado de verdade, sai sem tocar no device
 *   3) a trava: script sem flag não faz nada (só imprime a ajuda)
 *   4) sem employeeNo / sem face também ficam de fora
 *
 * Uso: node_modules/.bin/tsx scripts/test-sync-status-filter.ts
 * Cria e apaga seus próprios dados.
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-sync-status-filter.ts')

import * as path from 'path'
import { spawnSync } from 'child_process'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { fetchSyncTarget, fetchSyncTargets } from '../lib/hikvision/sync-targets'
import { createAllocation } from '../lib/terminals/allocation'

const SUF = Date.now().toString().slice(-6)
const FACE = encryptString('data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF)
const SCRIPT = path.resolve(__dirname, 'sync-faces-device.ts')

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

/** Roda o script de sync DE VERDADE e devolve o que ele imprimiu. */
function runScript(args: string[]): { status: number | null; out: string } {
  const tsxCli = require.resolve('tsx/cli')
  const r = spawnSync(process.execPath, [tsxCli, SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    timeout: 120000
  })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

async function main() {
  const created: { events: string[]; participants: string[]; terminals: string[] } = { events: [], participants: [], terminals: [] }

  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'TESTE filtro de status',
        slug: `sync-filter-${SUF}`,
        code: `SF-${SUF}`,
        startDate: now,
        endDate: new Date(now.getTime() + 86400000),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)

    // Terminal próprio do teste, alocado a ESTE evento: o escopo do sync agora
    // vem da alocação, então o teste precisa do seu próprio equipamento para
    // não depender do terminal real de bancada.
    const TEST_IP = `10.98.${SUF.slice(-2)}.${SUF.slice(-4, -2)}`
    const term = await prisma.terminal.create({
      data: { name: `FILTRO TESTE ${SUF}`, ipAddress: TEST_IP, isActive: true, passwordEncrypted: encryptString('x'), fdid: '1' }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000)
    })

    let seq = 0
    const mk = async (label: string, over: Record<string, any>) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id,
          name: `SYNCFILTER ${label} ${SUF}`,
          cpf: `9${SUF}${String(seq).padStart(4, '0')}`.slice(-11),
          status: 'active',
          isDeleted: false,
          approvalStatus: 'approved',
          employeeNo: `95${SUF}${seq}`.slice(-8),
          faceData: FACE,
          ...over
        }
      })
      created.participants.push(p.id)
      return p
    }

    const pAtivo     = await mk('ativo', {})
    const pRemovido  = await mk('removido', { status: 'removed' })
    const pExcluido  = await mk('excluido', { isDeleted: true })
    const pSemFace   = await mk('semface', { faceData: null, faceImageUrl: null })
    const pSemEmp    = await mk('sememp', { employeeNo: null })
    const pNaoAprov  = await mk('naoaprovado', { approvalStatus: 'pending' })

    console.log('\n=== 1) seleção em massa (--all) ===')
    const lookup = await fetchSyncTargets(term.id)
    check('terminal tem alocação vigente', lookup.ok === true, lookup.ok ? undefined : lookup)
    const targets = lookup.ok ? lookup.targets : []
    const empNos = targets.map(t => t.employeeNo)
    check('participante ativo está na lista', empNos.includes(pAtivo.employeeNo!), empNos)
    check('REMOVIDO (status=removed) fora da lista', !empNos.includes(pRemovido.employeeNo!))
    check('EXCLUÍDO (isDeleted=true) fora da lista', !empNos.includes(pExcluido.employeeNo!))
    check('sem face fora da lista', !empNos.includes(pSemFace.employeeNo!))
    check('sem employeeNo fora da lista', targets.every(t => t.id !== pSemEmp.id))
    check('não aprovado (evento exige) fora da lista', !empNos.includes(pNaoAprov.employeeNo!))
    check('lista contém EXATAMENTE o ativo', targets.length === 1, targets.length)

    console.log('\n=== 2) modo participante único ===')
    const okAtivo = await fetchSyncTarget(term.id, pAtivo.id)
    check('ativo por id: aceito', okAtivo.ok === true)
    const okPorEmp = await fetchSyncTarget(term.id, pAtivo.employeeNo!)
    check('ativo por employeeNo: aceito', okPorEmp.ok === true)

    const remById = await fetchSyncTarget(term.id, pRemovido.id)
    check('REMOVIDO por id: recusado com reason=removed', !remById.ok && remById.reason === 'removed', remById)
    const remByEmp = await fetchSyncTarget(term.id, pRemovido.employeeNo!)
    check('REMOVIDO por employeeNo: recusado', !remByEmp.ok && remByEmp.reason === 'removed')
    const excById = await fetchSyncTarget(term.id, pExcluido.id)
    check('EXCLUÍDO por id: recusado com reason=removed', !excById.ok && excById.reason === 'removed')
    const semEmp = await fetchSyncTarget(term.id, pSemEmp.id)
    check('sem employeeNo: recusado', !semEmp.ok && semEmp.reason === 'no-employee-no')

    console.log('\n=== 3) script REAL: sync de um removido não chega ao device ===')
    const run = runScript([`--participant=${pRemovido.id}`, `--ip=${TEST_IP}`])
    check('saiu com código de erro', run.status === 1, run.status)
    check('imprimiu a recusa', /Recusado \(removed\)/.test(run.out))
    // Resolver o equipamento no banco é leitura local; o que não pode acontecer
    // é abrir conexão (sonda de auth / uso de credencial) nem enviar.
    check('NÃO abriu conexão com o terminal', !/Auth exigida/.test(run.out) && !/Credencial:/.test(run.out))
    check('não reportou nenhum envio', !/sincronizado e confirmado/.test(run.out))

    console.log('\n=== 4) trava: sem flag não faz nada ===')
    const bare = runScript([])
    check('imprimiu a ajuda', /Sem flag este script NÃO FAZ NADA/.test(bare.out))
    check('não processou ninguém', !/Relatório final/.test(bare.out))
    check('não conectou no terminal', !/Auth exigida/.test(bare.out) && !/Credencial:/.test(bare.out))

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
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
