/**
 * Teto de tentativas na RECONCILIAÇÃO (P1/P2) — o teste que faltava.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────
 * `test-reconcile.ts` cobre o DIFF da reconciliação, mas todos os cenários dele
 * usam linhas com `attempts=0`: nenhum encosta no teto. O bug que originou esta
 * mudança vivia exatamente aí — o `/work` aplica `attempts < MAX_ATTEMPTS` só
 * às linhas `failed`, e `pending` não tem teto nenhum; como a reconciliação
 * devolvia a linha para `pending` a cada ciclo de 60s, o teto NUNCA mordia.
 * Uma participante acumulou 6.687 tentativas em 6 dias contra um erro
 * determinístico (2026-08-30).
 *
 * O invariante sob teste, em uma frase: **conteúdo IGUAL respeita o teto;
 * conteúdo NOVO ganha contador novo.**
 *
 * Cobre:
 *   1) linha ESGOTADA + device sem a face  → NÃO volta para `pending` (P1)
 *   2) linha NÃO esgotada, mesmo cenário   → volta (não quebramos o retry)
 *   3) linha ESGOTADA + faceVersion NOVO   → volta E zera attempts (P2)
 *   4) enqueueFaceChange zera attempts/lastError (P2, caminho da re-captura)
 *   5) o `/work` não serve linha esgotada (o teto vale nas duas pontas)
 *
 * Não precisa de device. Requer o dev server no ar (item 5 usa a API).
 * Cria e apaga seus próprios dados.
 *
 * Uso: .\scripts\testar.ps1 scripts\test-retry-teto.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-retry-teto.ts')

import { prisma } from '../lib/prisma'
import { createAllocation } from '../lib/terminals/allocation'
import { encryptString } from '../lib/crypto'
import { generateAgentToken, revokeAgentToken } from '../lib/agent/tokens'
import { reconcileTerminal } from '../lib/agent/reconcile'
import { enqueueFaceChange } from '../lib/agent/sync-enqueue'
import { MAX_ATTEMPTS } from '../lib/agent/retry-policy'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `teto-${Date.now()}`
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
    const ev = await prisma.event.create({
      data: {
        name: 'TETO TEST', slug: `t-${SUF}`, code: `T-${SUF}`.slice(0, 20),
        startDate: now, endDate: new Date(now.getTime() + 86400000),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({
      data: {
        eventId: ev.id, name: 'TETO', ipAddress: '192.168.9.78',
        isActive: true, passwordEncrypted: encryptString('x')
      }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000)
    })

    /**
     * Participante elegível + linha de sync em `failed` com `attempts` à
     * escolha. `faceVersion` da LINHA igual ao do participante = "a face que
     * está lá é a que se queria" — é o que distingue conteúdo igual de novo.
     */
    const mk = async (emp: string, attempts: number, faceVersion: string) => {
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `P${emp}`, cpf: `${emp}${Date.now()}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          employeeNo: emp, cardNumber: `95000000000000${emp.slice(-1)}`,
          faceData: FACE, faceVersion
        }
      })
      created.participants.push(p.id)
      const row = await prisma.participantTerminalSync.create({
        data: {
          participantId: p.id, terminalId: term.id,
          faceState: 'failed', cardState: 'synced', removalState: 'none',
          faceVersion, attempts,
          lastError: 'uploadFace falhou — device: statusCode=6 badJsonContent',
          lastAttemptAt: new Date(now.getTime() - 10 * 60 * 1000)
        }
      })
      return { p, row }
    }

    // Esgotada, conteúdo igual  → P1 deve segurar
    const esgotada = await mk('95000001', MAX_ATTEMPTS, 'v-igual-1')
    // NÃO esgotada, conteúdo igual → deve continuar voltando
    const viva = await mk('95000002', 2, 'v-igual-2')
    // Esgotada, mas a foto MUDOU → P2 deve liberar e zerar
    const trocada = await mk('95000003', MAX_ATTEMPTS, 'v-antiga-3')

    // O participante 95000003 teve a foto re-capturada: versão do PARTICIPANTE
    // passa a diferir da versão gravada NA LINHA. É isso que `faceNeedsUpdate`
    // enxerga.
    await prisma.participant.update({
      where: { id: trocada.p.id },
      data: { faceVersion: 'v-NOVA-3' }
    })

    // Os três estão NO device, mas sem face (numOfFace=0) — o cenário exato que
    // realimentava o loop: o device confirma que falta a face, então a
    // reconciliação "quer" re-empurrar as três.
    const users = [
      { employeeNo: '95000001', numOfFace: 0, numOfCard: 1 },
      { employeeNo: '95000002', numOfFace: 0, numOfCard: 1 },
      { employeeNo: '95000003', numOfFace: 0, numOfCard: 1 }
    ]

    console.log(`\n=== teto = ${MAX_ATTEMPTS} tentativas ===`)
    console.log('\n=== 1) reconciliação com o teto ===')
    const r = await reconcileTerminal(term.id, users)
    // Só as duas que PODEM voltar (a viva e a de foto nova).
    check('pushesEnqueued=2 (a esgotada de conteúdo igual NÃO entra)', r.pushesEnqueued === 2, r.pushesEnqueued)

    const rowOf = (id: string) => prisma.participantTerminalSync.findUnique({ where: { id } })
    const rEsg = await rowOf(esgotada.row.id)
    const rViva = await rowOf(viva.row.id)
    const rTroc = await rowOf(trocada.row.id)

    console.log('\n=== 2) P1: esgotada + conteúdo igual NÃO ressuscita ===')
    check('faceState continua failed (não virou pending)', rEsg?.faceState === 'failed', rEsg?.faceState)
    check('attempts intacto (não zerou sozinho)', rEsg?.attempts === MAX_ATTEMPTS, rEsg?.attempts)
    check('lastError preservado (é o que a tela mostra)', !!rEsg?.lastError)

    console.log('\n=== 3) retry normal preservado (não esgotada) ===')
    check('faceState=pending (volta para a fila)', rViva?.faceState === 'pending', rViva?.faceState)
    check('attempts preservado (o teto ainda conta)', rViva?.attempts === 2, rViva?.attempts)

    console.log('\n=== 4) P2: foto NOVA ganha contador novo ===')
    check('faceState=pending (liberada apesar de esgotada)', rTroc?.faceState === 'pending', rTroc?.faceState)
    check('attempts zerado', rTroc?.attempts === 0, rTroc?.attempts)
    check('lastError limpo', rTroc?.lastError === null, rTroc?.lastError)
    check('cardState=pending junto (agente apaga+recria)', rTroc?.cardState === 'pending', rTroc?.cardState)

    console.log('\n=== 5) P2: enqueueFaceChange zera o contador ===')
    // Volta a esgotada para failed/esgotada e chama o caminho da re-captura.
    await prisma.participantTerminalSync.update({
      where: { id: esgotada.row.id },
      data: { faceState: 'failed', attempts: MAX_ATTEMPTS, lastError: 'erro velho' }
    })
    await enqueueFaceChange(esgotada.p.id)
    const rPos = await rowOf(esgotada.row.id)
    check('faceState=pending', rPos?.faceState === 'pending', rPos?.faceState)
    check('attempts zerado (senão o /work seguiria barrando)', rPos?.attempts === 0, rPos?.attempts)
    check('lastError limpo', rPos?.lastError === null, rPos?.lastError)

    console.log('\n=== 6) o /work não serve linha esgotada ===')
    const { id: tokId, token } = await generateAgentToken({ eventId: ev.id, name: 'PC teto' })
    created.tokens.push(tokId)
    // Deixa SÓ a esgotada em estado de falha; as outras saem de cena.
    await prisma.participantTerminalSync.update({
      where: { id: esgotada.row.id },
      data: { faceState: 'failed', cardState: 'synced', attempts: MAX_ATTEMPTS, lastAttemptAt: new Date(now.getTime() - 10 * 60 * 1000) }
    })
    await prisma.participantTerminalSync.updateMany({
      where: { id: { in: [viva.row.id, trocada.row.id] } },
      data: { faceState: 'synced', cardState: 'synced' }
    })
    const res = await fetch(`${BASE}/api/agent/work?terminalId=${term.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const work = await res.json()
    check('200', res.status === 200, res.status)
    const servidos = (work.push ?? []).map((i: any) => i.employeeNo)
    check('a esgotada NÃO foi servida', !servidos.includes('95000001'), servidos)

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

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
