/**
 * Elegibilidade no fan-out e no token de edição — as três correções.
 *
 * ── O buraco original ──────────────────────────────────────────────────────
 * Quem era aprovado ANTES de ter foto ficava ativo, aprovado, com biometria
 * depois — e INVISÍVEL nos terminais, sem erro em lugar nenhum. Dois motivos
 * somados: `enqueueFaceChange` é `updateMany` (no-op sem linhas), e ninguém
 * atribuía `employeeNo` quando a foto finalmente chegava. O `/work` pula linha
 * sem `employeeNo` e a reconciliação nem olha (filtra `employeeNo not null`).
 *
 * O conserto raso ("não achou linha, então cria") tinha um efeito pior: para um
 * REMOVIDO o `updateMany` também conta 0 (filtra `removalState: 'none'`), então
 * o fallback cairia no revival do `enqueueForContext` e devolveria a pessoa aos
 * terminais. Com o token de edição não olhando status, bastava um link antigo.
 *
 * Por isso as três, e não uma:
 *   (a) `enqueueForContext` checa elegibilidade  — fecha a CLASSE de revival
 *   (b) o caminho da foto chama `onBecameEligible` — devolve quem estava invisível
 *   (c) `validateEditToken` recusa removido       — fecha a porta de entrada
 *
 * Cada bloco abaixo falha se a sua correção for revertida (verificado por
 * mutação). Não precisa de device; requer o dev server no ar.
 *
 * Uso: .\scripts\testar.ps1 scripts\test-elegibilidade-enqueue.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-elegibilidade-enqueue.ts')

import { prisma } from '../lib/prisma'
import { createAllocation } from '../lib/terminals/allocation'
import { encryptString } from '../lib/crypto'
import { enqueueForContext, onBecameEligible, enqueueRemoval } from '../lib/agent/sync-enqueue'
import { generateParticipantEditToken } from '../lib/participant-edit/tokens'
import { validateEditToken } from '../lib/participant-edit/validate'
import { faceVersionOf } from '../lib/face/version'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `eleg-${Date.now()}`
const FACE_URL = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF
const FACE = encryptString(FACE_URL)

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'ELEG TEST', slug: `e-${SUF}`, code: `E-${SUF}`.slice(0, 20),
        startDate: now, endDate: new Date(now.getTime() + 86400000),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({
      data: {
        eventId: ev.id, name: 'ELEG', ipAddress: '192.168.9.79',
        isActive: true, passwordEncrypted: encryptString('x')
      }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000)
    })

    let seq = 0
    const mkP = async (over: any = {}) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          faceData: FACE, faceVersion: faceVersionOf(FACE_URL),
          ...over
        }
      })
      created.participants.push(p.id)
      return p
    }
    const rowsOf = (pid: string) =>
      prisma.participantTerminalSync.findMany({ where: { participantId: pid } })

    // ─────────────────────────────────────────────────────── (a) elegibilidade
    console.log('\n=== (a) enqueueForContext recusa quem NAO e elegivel ===')

    const semFace = await mkP({ faceData: null, faceVersion: null })
    await enqueueForContext(ev.id, semFace.id)
    check('sem foto: nenhuma linha criada', (await rowsOf(semFace.id)).length === 0)

    const naoAprovado = await mkP({ approvalStatus: 'pending' })
    await enqueueForContext(ev.id, naoAprovado.id)
    check('pendente de aprovacao: nenhuma linha', (await rowsOf(naoAprovado.id)).length === 0)

    const removido = await mkP({ status: 'removed' })
    await enqueueForContext(ev.id, removido.id)
    check('removido: nenhuma linha', (await rowsOf(removido.id)).length === 0)

    const excluido = await mkP({ isDeleted: true })
    await enqueueForContext(ev.id, excluido.id)
    check('isDeleted: nenhuma linha', (await rowsOf(excluido.id)).length === 0)

    const ok = await mkP()
    await enqueueForContext(ev.id, ok.id)
    check('ELEGIVEL: linha criada (nao quebramos o caminho feliz)', (await rowsOf(ok.id)).length === 1)

    // O revival é o caminho perigoso: linha em remoção + subject inelegível.
    console.log('\n=== (a2) revival NAO ressuscita removido ===')
    const exSync = await mkP()
    await enqueueForContext(ev.id, exSync.id)
    await enqueueRemoval(exSync.id)
    await prisma.participant.update({ where: { id: exSync.id }, data: { status: 'removed' } })
    await enqueueForContext(ev.id, exSync.id) // tentativa de revival
    const rev = await rowsOf(exSync.id)
    check('linha continua em remocao (nao voltou a pending)',
          rev.every(r => r.removalState === 'pending'), rev.map(r => r.removalState))

    // ──────────────────────────────────────────────── (b) a foto que chega depois
    console.log('\n=== (b) primeira foto atribui identidade E enfileira ===')
    // Aprovado ANTES de ter foto: sem employeeNo, sem linha.
    const tardio = await mkP({ faceData: null, faceVersion: null })
    await onBecameEligible(ev.id, tardio.id)
    const antes = await prisma.participant.findUnique({
      where: { id: tardio.id }, select: { employeeNo: true }
    })
    check('antes da foto: sem employeeNo', antes?.employeeNo === null, antes?.employeeNo)
    check('antes da foto: sem linha de sync', (await rowsOf(tardio.id)).length === 0)

    // A foto chega (é o que `participants/update` faz ao mudar a face).
    await prisma.participant.update({
      where: { id: tardio.id },
      data: { faceData: FACE, faceVersion: faceVersionOf(FACE_URL) }
    })
    await onBecameEligible(ev.id, tardio.id)

    const depois = await prisma.participant.findUnique({
      where: { id: tardio.id }, select: { employeeNo: true }
    })
    check('depois da foto: employeeNo ATRIBUIDO', !!depois?.employeeNo, depois?.employeeNo)
    const linhasTardio = await rowsOf(tardio.id)
    check('depois da foto: linha de sync criada', linhasTardio.length === 1)
    check('linha em pending (vai ser servida)',
          linhasTardio[0]?.faceState === 'pending', linhasTardio[0]?.faceState)

    // ────────────────────────────────────────────────────── (c) token de edição
    console.log('\n=== (c) token de edicao recusa removido ===')
    const comLink = await mkP()
    const { token: tk } = await generateParticipantEditToken(comLink.id, {
      adminEmail: `teste-${SUF}@local`
    })
    const acessoAtivo = await validateEditToken(tk)
    check('ativo: token VALE (caminho feliz intacto)', acessoAtivo !== null)

    await prisma.participant.update({ where: { id: comLink.id }, data: { status: 'removed' } })
    check('removido: token RECUSADO', (await validateEditToken(tk)) === null)

    // Reativado volta a valer: a trava é sobre estado ATUAL, não revogação.
    await prisma.participant.update({ where: { id: comLink.id }, data: { status: 'active' } })
    check('reativado: MESMO token volta a valer (nao e revogacao)',
          (await validateEditToken(tk)) !== null)

    await prisma.participant.update({ where: { id: comLink.id }, data: { isDeleted: true } })
    check('isDeleted: token RECUSADO', (await validateEditToken(tk)) === null)
    await prisma.participant.update({ where: { id: comLink.id }, data: { isDeleted: false } })

    // O link existe JUSTAMENTE para quem ainda não tem foto/aprovação: se a
    // trava usasse `isEligible`, quebraria o fluxo principal.
    await prisma.participant.update({
      where: { id: comLink.id },
      data: { approvalStatus: 'pending', faceData: null, faceVersion: null }
    })
    check('pendente e SEM foto: token VALE (a trava e sobre remocao, nao elegibilidade)',
          (await validateEditToken(tk)) !== null)

    // ────────────────────────────────── (b2) o mesmo, pelo ENDPOINT de verdade
    // Os blocos acima chamam `onBecameEligible` direto, o que prova o
    // comportamento da FUNÇÃO — mas não que `participants/update` a chame.
    // Sem este bloco, apagar a chamada do endpoint passaria despercebido: o
    // teste continuaria verde e o bug voltaria inteiro. Por isso a requisição
    // real, com token de edição, exatamente como o celular faz.
    console.log('\n=== (b2) POST /api/participants/update: foto nova => employeeNo ===')
    const viaApi = await mkP({ faceData: null, faceVersion: null })
    const { token: tkApi } = await generateParticipantEditToken(viaApi.id, {
      adminEmail: `teste-api-${SUF}@local`
    })
    const semEmp = await prisma.participant.findUnique({
      where: { id: viaApi.id }, select: { employeeNo: true }
    })
    check('antes: sem employeeNo', semEmp?.employeeNo === null, semEmp?.employeeNo)

    const resp = await fetch(`${BASE}/api/participants/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tkApi, faceImage: FACE_URL })
    })
    check('endpoint respondeu 200', resp.status === 200, resp.status)

    const posApi = await prisma.participant.findUnique({
      where: { id: viaApi.id }, select: { employeeNo: true, faceVersion: true }
    })
    check('depois: employeeNo ATRIBUIDO pelo endpoint', !!posApi?.employeeNo, posApi?.employeeNo)
    const linhasApi = await rowsOf(viaApi.id)
    check('depois: linha de sync criada pelo endpoint', linhasApi.length === 1, linhasApi.length)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.participantEditToken.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
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
  .catch((e) => { console.error('ERRO:', e?.message ?? e); process.exit(1) })
