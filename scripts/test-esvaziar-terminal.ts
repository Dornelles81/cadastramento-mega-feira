/**
 * Esvaziar terminal (limpeza pós-feira) — `drainTerminal`.
 *
 * A limpeza dos terminais no fim do evento é obrigação de LGPD e até 2026-09-02
 * não existia caminho pelo sistema: `enqueueRemoval` é por participante,
 * `reconcileTerminal` recusa esvaziar sem alocação vigente (trava deliberada) e
 * encerrar a alocação apenas cala o agente. Restava apagar no painel de cada
 * aparelho, sem rastro.
 *
 * O que este teste fixa:
 *   - drena TODAS as linhas do terminal, inclusive as nunca sincronizadas
 *     (`applyRemoval` trata "não existe no device" como sucesso, então marcar é
 *     correto e é o que produz a afirmação "esta pessoa não está aqui");
 *   - NÃO encosta em outro terminal — o escopo é o pedido, não o evento;
 *   - respeita `removed` (idempotente: rodar duas vezes não re-marca);
 *   - zera `attempts`/`lastError`, senão uma linha que esgotou o teto no PUSH
 *     nasceria barrada na REMOÇÃO;
 *   - devolve a contagem, que é o que vai para o audit log e permite conferir
 *     depois se o número bateu.
 *
 * Requer banco de teste. Uso: .\scripts\testar.ps1 scripts\test-esvaziar-terminal.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-esvaziar-terminal.ts')

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { createAllocation } from '../lib/terminals/allocation'
import { drainTerminal } from '../lib/agent/sync-enqueue'
import { MAX_ATTEMPTS } from '../lib/agent/retry-policy'

const SUF = `drain-${Date.now()}`

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

async function main() {
  const criados: any = { events: [], terminals: [], participants: [] }
  try {
    const agora = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'DRAIN TEST', slug: `d-${SUF}`, code: `D-${SUF}`.slice(0, 20),
        startDate: agora, endDate: new Date(agora.getTime() + 30 * 86400000),
        requiresApprovalForAccess: true
      }
    })
    criados.events.push(ev.id)

    const mkTerm = async (n: number) => {
      const t = await prisma.terminal.create({
        data: {
          eventId: ev.id, name: `T${n}-${SUF}`.slice(0, 40),
          ipAddress: `192.168.66.${n}`, isActive: true, passwordEncrypted: encryptString('x')
        }
      })
      criados.terminals.push(t.id)
      await createAllocation({
        terminalId: t.id, eventId: ev.id,
        startDate: new Date(agora.getTime() - 86400000),
        endDate: new Date(agora.getTime() + 30 * 86400000)
      })
      return t
    }
    const alvo = await mkTerm(1)
    const vizinho = await mkTerm(2)

    // Quatro linhas no ALVO, cobrindo os estados que importam.
    let seq = 0
    const mkLinha = async (terminalId: string, dados: any) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          faceData: encryptString('data:image/jpeg;base64,/9j/FAKE-' + seq)
        }
      })
      criados.participants.push(p.id)
      return prisma.participantTerminalSync.create({
        data: { participantId: p.id, terminalId, ...dados }
      })
    }

    const sincronizada = await mkLinha(alvo.id, { faceState: 'synced', cardState: 'synced', removalState: 'none' })
    const nuncaEmpurrada = await mkLinha(alvo.id, { faceState: 'pending', cardState: 'pending', removalState: 'none' })
    const esgotada = await mkLinha(alvo.id, {
      faceState: 'failed', cardState: 'failed', removalState: 'none',
      attempts: MAX_ATTEMPTS, lastError: 'device fora do ar'
    })
    const jaRemovida = await mkLinha(alvo.id, { faceState: 'na', cardState: 'na', removalState: 'removed' })
    const doVizinho = await mkLinha(vizinho.id, { faceState: 'synced', cardState: 'synced', removalState: 'none' })

    console.log('\n=== drenar o terminal ALVO ===')
    const marcadas = await drainTerminal(alvo.id)
    check('marcou 3 linhas (a já removida fica de fora)', marcadas === 3, marcadas)

    const ler = (id: string) => prisma.participantTerminalSync.findUnique({ where: { id } })

    const s = await ler(sincronizada.id)
    check('sincronizada -> removalState pending', s?.removalState === 'pending', s?.removalState)

    const n = await ler(nuncaEmpurrada.id)
    check('nunca empurrada TAMBEM entra', n?.removalState === 'pending', n?.removalState)

    const e = await ler(esgotada.id)
    check('esgotada -> removalState pending', e?.removalState === 'pending', e?.removalState)
    check('esgotada teve attempts zerado', e?.attempts === 0, e?.attempts)
    check('esgotada teve lastError limpo', e?.lastError === null, e?.lastError)

    const j = await ler(jaRemovida.id)
    check('ja removida CONTINUA removed', j?.removalState === 'removed', j?.removalState)

    const v = await ler(doVizinho.id)
    check('terminal vizinho INTACTO', v?.removalState === 'none', v?.removalState)

    console.log('\n=== idempotencia ===')
    const denovo = await drainTerminal(alvo.id)
    check('segunda passada nao re-marca as ja pendentes', denovo === 3, denovo)
    const v2 = await ler(doVizinho.id)
    check('vizinho segue intacto na segunda passada', v2?.removalState === 'none', v2?.removalState)

    console.log('\n=== terminal sem linhas ===')
    const vazio = await mkTerm(3)
    check('drenar terminal vazio devolve 0', (await drainTerminal(vazio.id)) === 0)

  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.participant.deleteMany({ where: { id: { in: criados.participants } } })
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: criados.terminals } } })
    await prisma.terminal.deleteMany({ where: { id: { in: criados.terminals } } })
    await prisma.event.deleteMany({ where: { id: { in: criados.events } } })
    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S)'} ===`)
    await prisma.$disconnect()
    process.exit(falhas === 0 ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
