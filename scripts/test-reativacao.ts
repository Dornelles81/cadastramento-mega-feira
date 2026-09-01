/**
 * Reativação de credenciado removido — as três decisões de regra.
 *
 * 1. COTA devolvida SÓ na mesma janela do dia operacional (distingue "errei
 *    agora" de "estou burlando" — devolver sempre tornaria a cota sugestão).
 * 2. slotLockedUntil RESPEITADO (reativar não é a porta dos fundos da regra
 *    anti-rotatividade).
 * 3. ADMIN também reativa, sem exigir o stand (escape durante a feira).
 *
 * E o invariante que mais importa: reativar NÃO devolve acesso físico. A
 * remoção apagou a biometria; a pessoa volta à equipe inelegível e só chega ao
 * terminal com foto nova.
 *
 * Uso: .\scripts\testar.ps1 scripts\test-reativacao.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-reativacao.ts')

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { reativarParticipante } from '../lib/participants/reactivation'
import { nextDayReset } from '../lib/stand-access/occupancy'
import { CPF_DUPLICADO_MENSAGEM } from '../lib/participants/cpf-duplicado'

const SUF = `reat-${Date.now()}`

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

async function main() {
  const created: any = { events: [], stands: [], participants: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'REAT TEST', slug: `r-${SUF}`, code: `R-${SUF}`.slice(0, 20),
        startDate: new Date(now.getTime() - 86400000), // já começou: cota ativa
        endDate: new Date(now.getTime() + 86400000),
        substitutionQuotaEnabled: true,
        substitutionsPerSlot: 1,
        dayResetHour: 4
      }
    })
    created.events.push(ev.id)

    const stand = await prisma.stand.create({
      data: {
        eventId: ev.id, code: `ST-${SUF}`.slice(0, 20), name: 'Stand Teste',
        maxRegistrations: 3, currentCount: 0, substitutionsUsed: 2
      }
    })
    created.stands.push(stand.id)

    let seq = 0
    const mkRemovido = async (over: any = {}) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, standId: stand.id,
          name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'removed', isDeleted: false,
          removedAt: now,          // mesma janela por padrão
          removedBy: 'gestor@stand.com',
          faceData: null,          // a remoção apaga a biometria
          ...over
        }
      })
      created.participants.push(p.id)
      return p
    }

    console.log('\n=== 1) COTA: mesma janela devolve ===')
    const p1 = await mkRemovido()
    const r1 = await reativarParticipante({
      participantId: p1.id, standIdEsperado: stand.id,
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('reativou', r1.ok === true, r1.falha)
    check('cota devolvida', r1.cotaDevolvida === true)
    const s1 = await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true, currentCount: true } })
    check('substitutionsUsed 2 -> 1', s1?.substitutionsUsed === 1, s1?.substitutionsUsed)
    check('currentCount recontado', s1?.currentCount === 1, s1?.currentCount)
    const d1 = await prisma.participant.findUnique({ where: { id: p1.id }, select: { status: true, removedAt: true, removedBy: true } })
    check('status active', d1?.status === 'active')
    check('removedAt limpo', d1?.removedAt === null)

    // O invariante central.
    check('NAO devolve acesso: sem foto', r1.participante?.temFoto === false)

    console.log('\n=== 1b) COTA: janela ANTERIOR nao devolve ===')
    await prisma.stand.update({ where: { id: stand.id }, data: { substitutionsUsed: 2 } })
    const p2 = await mkRemovido({
      // removido "ontem": antes da última virada do dia operacional
      removedAt: new Date(now.getTime() - 48 * 3600 * 1000)
    })
    const r2 = await reativarParticipante({
      participantId: p2.id, standIdEsperado: stand.id,
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('reativou', r2.ok === true, r2.falha)
    check('cota NAO devolvida', r2.cotaDevolvida === false)
    const s2 = await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true } })
    check('substitutionsUsed intacto em 2', s2?.substitutionsUsed === 2, s2?.substitutionsUsed)

    console.log('\n=== 2) slotLockedUntil RESPEITADO ===')
    const p3 = await mkRemovido({ slotLockedUntil: nextDayReset(4, now) })
    const r3 = await reativarParticipante({
      participantId: p3.id, standIdEsperado: stand.id,
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('RECUSA', r3.ok === false)
    check('motivo = vaga-travada', r3.falha === 'vaga-travada', r3.falha)
    check('diz quando libera', !!r3.liberaEm)
    const d3 = await prisma.participant.findUnique({ where: { id: p3.id }, select: { status: true } })
    check('continua removido', d3?.status === 'removed', d3?.status)

    console.log('\n=== escopo: gestor NAO alcanca outro stand ===')
    const outro = await prisma.stand.create({
      data: { eventId: ev.id, code: `OT-${SUF}`.slice(0, 20), name: 'Outro', maxRegistrations: 5 }
    })
    created.stands.push(outro.id)
    const p4 = await mkRemovido({ standId: outro.id })
    const r4 = await reativarParticipante({
      participantId: p4.id,
      standIdEsperado: stand.id, // gestor do stand ERRADO
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('recusa por escopo', r4.ok === false && r4.falha === 'nao-encontrado', r4.falha)

    console.log('\n=== 3) ADMIN reativa sem exigir stand ===')
    const r5 = await reativarParticipante({
      participantId: p4.id,
      standIdEsperado: null, // escape do admin
      ator: { tipo: 'admin', email: 'admin@org.com' }
    })
    check('admin alcanca', r5.ok === true, r5.falha)
    const au5 = await prisma.auditLog.findFirst({
      where: { entityId: p4.id, action: 'PARTICIPANT_REACTIVATED' },
      orderBy: { createdAt: 'desc' }
    })
    check('audit registra actorType=admin', au5?.actorType === 'admin', au5?.actorType)
    check('audit registra quem', au5?.actorIdentifier === 'admin@org.com')

    console.log('\n=== admin NAO burla o slotLockedUntil ===')
    const r6 = await reativarParticipante({
      participantId: p3.id, standIdEsperado: null,
      ator: { tipo: 'admin', email: 'admin@org.com' }
    })
    check('admin tambem recusado', r6.ok === false && r6.falha === 'vaga-travada', r6.falha)

    console.log('\n=== stand CHEIO bloqueia ===')
    // stand tem 3 vagas; p1 e p2 ativos = 2. Enche com mais um ativo.
    const ativo = await prisma.participant.create({
      data: {
        eventId: ev.id, standId: stand.id, name: `A-${SUF}`.slice(0, 40),
        cpf: `${Date.now()}9`.slice(-11), status: 'active', isDeleted: false
      }
    })
    created.participants.push(ativo.id)
    const p7 = await mkRemovido()
    const r7 = await reativarParticipante({
      participantId: p7.id, standIdEsperado: stand.id,
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('recusa por lotacao', r7.ok === false && r7.falha === 'stand-cheio', r7.falha)
    const d7 = await prisma.participant.findUnique({ where: { id: p7.id }, select: { status: true } })
    check('continua removido apos recusa', d7?.status === 'removed')

    console.log('\n=== ja ativo nao reativa ===')
    const r8 = await reativarParticipante({
      participantId: ativo.id, standIdEsperado: stand.id,
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com' }
    })
    check('recusa nao-removido', r8.ok === false && r8.falha === 'nao-removido', r8.falha)

    console.log('\n=== mensagem de CPF duplicado e INDISTINGUIVEL ===')
    check('nao revela remocao', !/remov/i.test(CPF_DUPLICADO_MENSAGEM), CPF_DUPLICADO_MENSAGEM)
    check('nao traz data', !/\d{2}\/\d{2}/.test(CPF_DUPLICADO_MENSAGEM))
    check('direciona ao responsavel', /respons/i.test(CPF_DUPLICADO_MENSAGEM))

    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.stand.deleteMany({ where: { id: { in: created.stands } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main()
  .then(() => process.exit(falhas === 0 ? 0 : 1))
  .catch((e) => { console.error('ERRO:', e?.message ?? e); process.exit(1) })
