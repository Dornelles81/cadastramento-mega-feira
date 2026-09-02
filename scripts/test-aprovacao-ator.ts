/**
 * Ator da aprovação: quem aprovou fica registrado?
 *
 * Até 2026-09-01 os TRÊS caminhos gravavam a string 'admin' fixa em
 * `approvedBy`, `approvalLog.adminUser` e `auditLog.adminUser` — o sistema
 * registrava a aprovação e não sabia quem a fez, mesmo com a sessão em mãos.
 *
 * Cobre também o fan-out: aprovar TEM que atribuir identidade e enfileirar. Um
 * dos caminhos (participants.ts) mudava o status sem isso, e produzia
 * participante aprovado e invisível nos terminais.
 *
 * Requer banco de teste. Uso: .\scripts\testar.ps1 scripts\test-aprovacao-ator.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-aprovacao-ator.ts')

import { prisma } from '../lib/prisma'
import { createAllocation } from '../lib/terminals/allocation'
import { encryptString } from '../lib/crypto'
import { aplicarAprovacao, atorDaSessao } from '../lib/participants/approval'
import { faceVersionOf } from '../lib/face/version'

const SUF = `ator-${Date.now()}`
const FACE_URL = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF
const FACE = encryptString(FACE_URL)

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

async function main() {
  const created: any = { events: [], terminals: [], participants: [], admins: [] }
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'ATOR TEST', slug: `a-${SUF}`, code: `A-${SUF}`.slice(0, 20),
        startDate: now, endDate: new Date(now.getTime() + 86400000),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)
    const term = await prisma.terminal.create({
      data: { eventId: ev.id, name: 'ATOR', ipAddress: '192.168.9.80', isActive: true, passwordEncrypted: encryptString('x') }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000),
      endDate: new Date(now.getTime() + 86400000)
    })

    let seq = 0
    const mkP = async () => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'pending',
          faceData: FACE, faceVersion: faceVersionOf(FACE_URL)
        }
      })
      created.participants.push(p.id)
      return p
    }

    // Admin REAL: `approvalLog.adminId` e FK para EventAdmin.
    const admin = await prisma.eventAdmin.create({
      data: {
        name: 'Fulano', email: `fulano-${SUF}@org.com`,
        password: 'x', role: 'SUPER_ADMIN', isActive: true
      }
    })
    created.admins = [admin.id]

    console.log('\n=== ator ADMIN registrado (nao mais "admin" fixo) ===')
    const p1 = await mkP()
    const r1 = await aplicarAprovacao({
      participantId: p1.id,
      acao: 'approve',
      ator: { tipo: 'admin', id: admin.id, email: 'fulano@org.com', nome: 'Fulano' },
      ip: '10.0.0.1'
    })
    check('retornou resultado', r1 !== null)
    check('aprovacao APLICADA (ok)', r1?.ok === true)
    check('statusAnterior=pending', r1?.ok === true && r1.statusAnterior === 'pending', r1?.ok === true ? r1.statusAnterior : r1?.falha)
    check('sincronizado', r1?.ok === true && r1.sincronizado === true)

    const dep1 = await prisma.participant.findUnique({
      where: { id: p1.id },
      select: { approvalStatus: true, approvedBy: true, employeeNo: true, _count: { select: { terminalSyncs: true } } }
    })
    check('approvedBy = e-mail real, NAO "admin"', dep1?.approvedBy === 'fulano@org.com', dep1?.approvedBy)
    check('aprovado', dep1?.approvalStatus === 'approved')
    // O fan-out: o caminho antigo de participants.ts pulava isto.
    check('FAN-OUT: employeeNo atribuido', !!dep1?.employeeNo, dep1?.employeeNo)
    check('FAN-OUT: linha de sync criada', (dep1?._count.terminalSyncs ?? 0) === 1, dep1?._count.terminalSyncs)

    const al1 = await prisma.approvalLog.findFirst({
      where: { participantId: p1.id }, orderBy: { createdAt: 'desc' }
    })
    check('approvalLog.adminEmail', al1?.adminEmail === 'fulano@org.com', al1?.adminEmail)
    check('approvalLog.adminUser (legado) tambem preenchido', al1?.adminUser === 'fulano@org.com', al1?.adminUser)
    check('approvalLog.adminId', al1?.adminId === admin.id, al1?.adminId)

    const au1 = await prisma.auditLog.findFirst({
      where: { entityId: p1.id, action: 'APPROVE' }, orderBy: { createdAt: 'desc' }
    })
    check('auditLog.actorType=admin', au1?.actorType === 'admin', au1?.actorType)
    check('auditLog.actorIdentifier', au1?.actorIdentifier === 'fulano@org.com', au1?.actorIdentifier)
    check('auditLog NAO diz "admin" no adminUser', au1?.adminUser !== 'admin', au1?.adminUser)

    console.log('\n=== ator RESPONSAVEL DE STAND (pre-requisito da delegacao) ===')
    const p2 = await mkP()
    await aplicarAprovacao({
      participantId: p2.id,
      acao: 'approve',
      ator: { tipo: 'stand_responsible', email: 'gestor@stand.com', standId: 'stand-9' }
    })
    const au2 = await prisma.auditLog.findFirst({
      where: { entityId: p2.id, action: 'APPROVE' }, orderBy: { createdAt: 'desc' }
    })
    check('actorType=stand_responsible', au2?.actorType === 'stand_responsible', au2?.actorType)
    check('actorIdentifier = e-mail do gestor', au2?.actorIdentifier === 'gestor@stand.com')
    check('descricao distingue o gestor', /respons/i.test(au2?.description ?? ''), au2?.description)
    const dep2 = await prisma.participant.findUnique({
      where: { id: p2.id }, select: { approvedBy: true, employeeNo: true }
    })
    check('approvedBy = gestor', dep2?.approvedBy === 'gestor@stand.com', dep2?.approvedBy)
    check('fan-out tambem vale para o gestor', !!dep2?.employeeNo)

    console.log('\n=== rejeicao ===')
    const p3 = await mkP()
    await aplicarAprovacao({
      participantId: p3.id, acao: 'reject',
      ator: { tipo: 'admin', id: null, email: 'chefe@org.com' },
      motivo: 'documento ilegivel'
    })
    const dep3 = await prisma.participant.findUnique({
      where: { id: p3.id },
      select: { approvalStatus: true, approvedBy: true, rejectionReason: true }
    })
    check('rejeitado', dep3?.approvalStatus === 'rejected')
    check('approvedBy nulo ao rejeitar', dep3?.approvedBy === null, dep3?.approvedBy)
    check('motivo gravado', dep3?.rejectionReason === 'documento ilegivel')

    console.log('\n=== RECUSA: aprovar sem biometria ===')
    // O caso real: removido (a remoção apaga a face) e depois reativado. Volta
    // sem foto, e aprovar produziria um "Aprovado" que a catraca desmente.
    const semFace = await prisma.participant.create({
      data: {
        eventId: ev.id, name: `SEMFACE-${SUF}`.slice(0, 40),
        cpf: `${Date.now()}90`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'pending',
        faceData: null, faceImageUrl: null
      }
    })
    created.participants.push(semFace.id)
    const rSem = await aplicarAprovacao({
      participantId: semFace.id, acao: 'approve',
      ator: { tipo: 'admin', email: 'fulano@org.com' }
    })
    check('recusou (ok=false)', rSem?.ok === false)
    check('motivo sem-biometria', rSem?.ok === false && rSem.falha === 'sem-biometria')
    const depSem = await prisma.participant.findUnique({
      where: { id: semFace.id },
      select: { approvalStatus: true, approvedBy: true, employeeNo: true, _count: { select: { terminalSyncs: true } } }
    })
    check('status INTACTO em pending', depSem?.approvalStatus === 'pending', depSem?.approvalStatus)
    check('nao ganhou employeeNo', depSem?.employeeNo === null, depSem?.employeeNo)
    check('nao enfileirou sync', depSem?._count.terminalSyncs === 0, depSem?._count.terminalSyncs)
    const logSem = await prisma.approvalLog.findFirst({ where: { participantId: semFace.id } })
    check('nao gravou approvalLog da recusa', !logSem)

    console.log('\n=== REJEITAR sem foto continua permitido ===')
    const rRej = await aplicarAprovacao({
      participantId: semFace.id, acao: 'reject',
      ator: { tipo: 'admin', email: 'fulano@org.com' }, motivo: 'sem foto'
    })
    check('rejeicao passa', rRej?.ok === true && rRej.statusNovo === 'rejected')

    console.log('\n=== evento com requireFace=false NAO e bloqueado ===')
    const evSemFace = await prisma.event.create({
      data: {
        name: 'SEM FACE', slug: `sf-${SUF}`, code: `SF-${SUF}`.slice(0, 20),
        startDate: now, endDate: new Date(now.getTime() + 86400000),
        requiresApprovalForAccess: true
      }
    })
    created.events.push(evSemFace.id)
    await prisma.eventConfig.create({ data: { eventId: evSemFace.id, requireFace: false } })
    const pLivre = await prisma.participant.create({
      data: {
        eventId: evSemFace.id, name: `LIVRE-${SUF}`.slice(0, 40),
        cpf: `${Date.now()}91`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'pending'
      }
    })
    created.participants.push(pLivre.id)
    const rLivre = await aplicarAprovacao({
      participantId: pLivre.id, acao: 'approve',
      ator: { tipo: 'admin', email: 'fulano@org.com' }
    })
    check('aprovou sem foto (evento dispensa)', rLivre?.ok === true && rLivre.statusNovo === 'approved',
      rLivre?.ok === false ? rLivre.falha : undefined)

    console.log('\n=== participante inexistente ===')
    check('devolve null (nao explode)',
      (await aplicarAprovacao({
        participantId: '00000000-0000-0000-0000-000000000000',
        acao: 'approve', ator: { tipo: 'admin', email: 'x@y.com' }
      })) === null)

    console.log('\n=== adminId INEXISTENTE nao pode derrubar o log ===')
    // approvalLog.adminId e FK: um id fora do EventAdmin violaria a constraint e
    // faria PERDER justamente o registro de autoria.
    const p4 = await mkP()
    await aplicarAprovacao({
      participantId: p4.id, acao: 'approve',
      ator: { tipo: 'admin', id: 'id-que-nao-existe', email: 'orfao@org.com' }
    })
    const al4 = await prisma.approvalLog.findFirst({ where: { participantId: p4.id } })
    check('approvalLog GRAVADO mesmo assim', !!al4)
    check('adminId nulo', al4?.adminId === null, al4?.adminId)
    check('e-mail preservado (a identidade e o que importa)', al4?.adminEmail === 'orfao@org.com')

    console.log('\n=== atorDaSessao ===')
    const a = atorDaSessao({ user: { id: 'u1', email: 'a@b.com', name: 'A' } })
    check('mapeia a sessao', a.tipo === 'admin' && a.email === 'a@b.com' && (a as any).id === 'u1')
    const semEmail = atorDaSessao({ user: { id: 'u2' } })
    check('sessao sem e-mail fica VISIVEL, nao vira "admin"',
      semEmail.email === '(sessao-sem-email)', semEmail.email)

    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.approvalLog.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.eventAdmin.deleteMany({ where: { id: { in: created.admins ?? [] } } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { entityId: { in: created.participants } } }).catch(() => {})
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main()
  .then(() => process.exit(falhas === 0 ? 0 : 1))
  .catch((e) => { console.error('ERRO:', e?.message ?? e); process.exit(1) })
