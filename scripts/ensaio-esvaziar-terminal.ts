/**
 * ENSAIO da limpeza de terminal — cenário completo no BANCO DE TESTE.
 *
 * Monta um evento fictício com um terminal e seis linhas de sync em estados
 * diferentes, para exercitar o botão "Esvaziar terminal" pela tela ANTES de
 * precisar dele em outubro. Nada aqui toca produção: a trava de `_guard` recusa
 * qualquer host que não seja o branch de teste.
 *
 * Uso (sempre pelo runner, que injeta o banco de teste):
 *
 *   .\scripts\testar.ps1 scripts\ensaio-esvaziar-terminal.ts              # monta
 *   .\scripts\testar.ps1 -Comando 'npx tsx scripts\ensaio-esvaziar-terminal.ts --simular-agente'
 *   .\scripts\testar.ps1 -Comando 'npx tsx scripts\ensaio-esvaziar-terminal.ts --limpar'
 *
 * E, para ver pela TELA, o dev server também precisa apontar para o teste:
 *
 *   .\scripts\testar.ps1 -Comando 'npm run dev'
 *
 * `--simular-agente` faz o que o agente faria se houvesse um device: pega as
 * remoções `pending` e as marca `removed`, como o /ack gravaria. É simulação
 * declarada — serve para ver o ciclo fechar na tela, não para provar o agente
 * (isso é `scripts/test-fanout.ts` e o teste de bancada).
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('ensaio-esvaziar-terminal.ts')

import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { createAllocation } from '../lib/terminals/allocation'
import { MAX_ATTEMPTS } from '../lib/agent/retry-policy'

const SLUG = 'ensaio-limpeza'
const EMAIL_ADMIN = 'ensaio@teste.local'
const SENHA_ADMIN = 'ensaio-limpeza-2026'
const NOME_TERMINAL = 'Terminal de Ensaio — Portão 9'

/** Apaga o fixture inteiro. Só alcança o que este script cria. */
async function limpar(): Promise<void> {
  const ev = await prisma.event.findUnique({ where: { slug: SLUG }, select: { id: true } })
  if (ev) {
    const ps = await prisma.participant.findMany({ where: { eventId: ev.id }, select: { id: true } })
    const ts = await prisma.terminal.findMany({ where: { eventId: ev.id }, select: { id: true } })
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: ps.map(p => p.id) } } })
    await prisma.auditLog.deleteMany({ where: { eventId: ev.id } })
    await prisma.participant.deleteMany({ where: { eventId: ev.id } })
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: ts.map(t => t.id) } } })
    await prisma.terminal.deleteMany({ where: { id: { in: ts.map(t => t.id) } } })
    await prisma.eventConfig.deleteMany({ where: { eventId: ev.id } })
    await prisma.event.delete({ where: { id: ev.id } })
  }
  await prisma.eventAdmin.deleteMany({ where: { email: EMAIL_ADMIN } })
}

async function montar(): Promise<void> {
  await limpar() // idempotente: rodar de novo recomeça do zero

  const agora = new Date()
  const ev = await prisma.event.create({
    data: {
      name: 'Ensaio — Limpeza de Terminal',
      slug: SLUG,
      code: 'ENSAIO-LIMPEZA',
      startDate: new Date(agora.getTime() - 2 * 86400000),
      endDate: new Date(agora.getTime() + 10 * 86400000),
      requiresApprovalForAccess: true,
      isActive: true
    }
  })

  const term = await prisma.terminal.create({
    data: {
      eventId: ev.id,
      name: NOME_TERMINAL,
      ipAddress: '10.99.99.9',
      deviceModel: 'DS-K1T671M-L (ficticio)',
      isActive: true,
      passwordEncrypted: encryptString('senha-de-ensaio'),
      capacityLimit: 5000,
      deviceUserCount: 6,
      deviceUserCountAt: agora,
      lastSeenAt: agora
    }
  })

  // Alocação VIGENTE, terminando em 5 dias: dentro dos 7 do aviso prévio, para
  // o banner âmbar e o selo "limpar em Xd" aparecerem já na primeira carga.
  await createAllocation({
    terminalId: term.id,
    eventId: ev.id,
    startDate: new Date(agora.getTime() - 2 * 86400000),
    endDate: new Date(agora.getTime() + 5 * 86400000)
  })

  // Seis linhas, cobrindo o que a limpeza encontra no mundo real.
  const cenarios: Array<{ nome: string; sync: any; nota: string }> = [
    { nome: 'Ana Ensaio', sync: { faceState: 'synced', cardState: 'synced', removalState: 'none' }, nota: 'sincronizada — o caso comum' },
    { nome: 'Bruno Ensaio', sync: { faceState: 'synced', cardState: 'synced', removalState: 'none' }, nota: 'sincronizada' },
    { nome: 'Carla Ensaio', sync: { faceState: 'synced', cardState: 'synced', removalState: 'none' }, nota: 'sincronizada' },
    { nome: 'Diego Ensaio', sync: { faceState: 'pending', cardState: 'pending', removalState: 'none' }, nota: 'a meio sync — biometria a caminho' },
    { nome: 'Elisa Ensaio', sync: { faceState: 'failed', cardState: 'failed', removalState: 'none', attempts: MAX_ATTEMPTS, lastError: 'ETIMEDOUT no device' }, nota: 'ESGOTADA — conta como falha na tela' },
    { nome: 'Fabio Ensaio', sync: { faceState: 'na', cardState: 'na', removalState: 'removed' }, nota: 'JÁ removida — o esvaziar não deve tocar' }
  ]

  let i = 0
  for (const c of cenarios) {
    i++
    const p = await prisma.participant.create({
      data: {
        eventId: ev.id,
        name: c.nome,
        cpf: `999000${String(i).padStart(5, '0')}`,
        status: 'active',
        isDeleted: false,
        approvalStatus: 'approved',
        approvedBy: EMAIL_ADMIN,
        approvedAt: agora,
        employeeNo: `9999000${i}`,
        faceData: encryptString(`data:image/jpeg;base64,/9j/ENSAIO-${i}`)
      }
    })
    await prisma.participantTerminalSync.create({
      data: { participantId: p.id, terminalId: term.id, ...c.sync }
    })
  }

  await prisma.eventAdmin.create({
    data: {
      name: 'Admin do Ensaio',
      email: EMAIL_ADMIN,
      password: await bcrypt.hash(SENHA_ADMIN, 10),
      role: 'SUPER_ADMIN', // dispensa vínculo por evento (hasEventPermission)
      isActive: true,
      emailVerified: true
    }
  })

  console.log('\n=== FIXTURE MONTADO (banco de teste) ===')
  for (const c of cenarios) console.log(`  ${c.nome.padEnd(16)} ${c.nota}`)
  console.log(`\nterminal: "${NOME_TERMINAL}" (10.99.99.9)`)
  console.log('alocação: vigente, vence em 5 dias -> o aviso prévio (7 dias) já acende')

  console.log('\n=== COMO EXERCITAR ===')
  console.log('1) suba o dev server APONTANDO PARA O TESTE:')
  console.log("     .\\scripts\\testar.ps1 -Comando 'npm run dev'")
  console.log('2) entre em http://localhost:3000/admin/login')
  console.log(`     usuário: ${EMAIL_ADMIN}`)
  console.log(`     senha  : ${SENHA_ADMIN}`)
  console.log(`3) abra http://localhost:3000/admin/eventos/${SLUG}/terminais`)
  console.log('\n=== O QUE ESPERAR ===')
  console.log('  · banner âmbar de limpeza pendente (3 pessoas sincronizadas, alocação vencendo)')
  console.log('  · selo "limpar em 4d" na linha do terminal')
  console.log('  · ANTES:  Sincronizados=3  Pendentes=1  Falhas=1')
  console.log('      (só o Diego conta como pendente; a Elisa conta como falha, não como pendente)')
  console.log('  · o link "Esvaziar terminal" aparece')
  console.log('  · no modal, o nome pode ser digitado com hífen comum no lugar do travessão')
  console.log('  · ao confirmar: 5 linhas marcadas (a do Fabio já estava removida e fica de fora)')
  console.log('  · DEPOIS: Sincronizados=0  Pendentes=5  Falhas=0')
  console.log('      (as 5 viram remoção pendente; a falha da Elisa some porque o')
  console.log('       esvaziar zera o contador — a remoção é operação nova)')
  console.log('\n  Para ver o ciclo FECHAR (o que o agente faria com um device real):')
  console.log("     .\\scripts\\testar.ps1 -Comando 'npx tsx scripts\\ensaio-esvaziar-terminal.ts --simular-agente'")
  console.log('\n  Para desmontar tudo:')
  console.log("     .\\scripts\\testar.ps1 -Comando 'npx tsx scripts\\ensaio-esvaziar-terminal.ts --limpar'")
}

/** Faz o que o /ack gravaria quando o agente confirma cada deleteUser. */
async function simularAgente(): Promise<void> {
  const ev = await prisma.event.findUnique({ where: { slug: SLUG }, select: { id: true } })
  if (!ev) {
    console.log('Fixture não existe. Monte primeiro (sem argumentos).')
    return
  }
  const ts = await prisma.terminal.findMany({ where: { eventId: ev.id }, select: { id: true } })
  const r = await prisma.participantTerminalSync.updateMany({
    where: { terminalId: { in: ts.map(t => t.id) }, removalState: { in: ['pending', 'failed'] } },
    // Espelha o /ack de uma remoção bem-sucedida: removalState='removed'.
    // faceState/cardState NÃO são revertidos — é assim no código real, e é por
    // isso que a tela conta "sincronizados" excluindo quem está removido.
    data: { removalState: 'removed', attempts: 0, lastError: null }
  })
  console.log(`\n${r.count} remoção(ões) confirmada(s), como o agente faria.`)
  console.log('Recarregue a tela: os contadores do terminal devem ir a zero.')
  console.log('\nATENÇÃO: isto é SIMULAÇÃO — nenhum device foi tocado. A prova de')
  console.log('que o agente executa de verdade é o teste de bancada com o terminal real.')
}

async function main() {
  const arg = process.argv[2]
  if (arg === '--limpar') {
    await limpar()
    console.log('Fixture removido do banco de teste.')
  } else if (arg === '--simular-agente') {
    await simularAgente()
  } else {
    await montar()
  }
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
