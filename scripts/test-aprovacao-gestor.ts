/**
 * Aprovação pelo painel do GESTOR — /api/stand-approval.
 *
 * Aprovar é a transição que dá ACESSO FÍSICO. Delegá-la ao responsável do stand
 * só é aceitável com as travas abaixo, e é isso que este teste fixa:
 *
 *   1. INTERRUPTOR POR EVENTO: desligado (default), o endpoint recusa.
 *   2. ESCOPO: token `register` não aprova; participante de OUTRO stand não é
 *      alcançável nem passando o id certo.
 *   3. captureAnyway: aprovar foto não validada exige confirmação explícita
 *      (428), e só passa com `confirmaFotoNaoValidada: true`.
 *   4. REJEITAR NÃO É EXCLUIR: a pessoa continua `active`, no stand, com a
 *      biometria intacta — e pode ser aprovada depois.
 *   5. Passa pelo MESMO núcleo: identidade atribuída, fan-out disparado e
 *      ator `stand_responsible` no audit (não uma segunda implementação).
 *   6. Sem biometria, recusa — a regra do núcleo vale igual para o gestor.
 *
 * Requer banco de teste. Uso: .\scripts\testar.ps1 scripts\test-aprovacao-gestor.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-aprovacao-gestor.ts')

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { createAllocation } from '../lib/terminals/allocation'
import { generateStandAccessToken } from '../lib/stand-access/tokens'
import handler from '../pages/api/stand-approval'

const SUF = `apr-${Date.now()}`
const FACE = encryptString('data:image/jpeg;base64,/9j/FAKE-' + SUF)

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

function fakeReqRes(body: any) {
  const req: any = {
    method: 'POST', body,
    headers: { 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250) + 1}`, 'user-agent': 'teste' },
    socket: { remoteAddress: '10.1.0.1' }
  }
  const res: any = {
    statusCode: 0, payload: null as any, headers: {} as any,
    setHeader(k: string, v: string) { this.headers[k] = v },
    status(c: number) { this.statusCode = c; return this },
    json(p: any) { this.payload = p; return this },
    end() { return this }
  }
  return { req, res }
}

async function main() {
  const criados: any = { events: [], stands: [], participants: [], terminals: [] }
  try {
    const agora = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'APROV GESTOR', slug: `ag-${SUF}`, code: `AG-${SUF}`.slice(0, 20),
        startDate: agora, endDate: new Date(agora.getTime() + 30 * 86400000),
        requiresApprovalForAccess: true
      }
    })
    criados.events.push(ev.id)
    const cfg = await prisma.eventConfig.create({
      data: { eventId: ev.id, standApprovalEnabled: false }
    })

    const term = await prisma.terminal.create({
      data: { eventId: ev.id, name: `T-${SUF}`.slice(0, 40), ipAddress: '192.168.55.1', isActive: true, passwordEncrypted: encryptString('x') }
    })
    criados.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(agora.getTime() - 86400000),
      endDate: new Date(agora.getTime() + 30 * 86400000)
    })

    const mkStand = async (n: string) => {
      const s = await prisma.stand.create({
        data: {
          eventId: ev.id, name: `Stand ${n}`.slice(0, 40), code: `${n}-${SUF}`.slice(0, 24),
          maxRegistrations: 10, isActive: true, responsibleEmail: `gestor-${n}@teste.local`
        }
      })
      criados.stands.push(s.id)
      return s
    }
    const standA = await mkStand('A')
    const standB = await mkStand('B')

    const ator = { adminId: null, adminEmail: 'admin@teste.local' }
    const { token: tkManageA } = await generateStandAccessToken(standA.id, ator, 'manage')
    const { token: tkRegisterA } = await generateStandAccessToken(standA.id, ator, 'register')

    let seq = 0
    const mkP = async (standId: string, extra: any = {}) => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, standId, name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'pending',
          faceData: FACE, ...extra
        }
      })
      criados.participants.push(p.id)
      return p
    }

    console.log('\n=== 1) interruptor DESLIGADO: recusa ===')
    const p1 = await mkP(standA.id)
    const r1 = fakeReqRes({ token: tkManageA, participantId: p1.id, acao: 'approve' })
    await handler(r1.req, r1.res)
    check('403 com interruptor off', r1.res.statusCode === 403, r1.res.statusCode)
    const dep1 = await prisma.participant.findUnique({ where: { id: p1.id }, select: { approvalStatus: true } })
    check('status intacto em pending', dep1?.approvalStatus === 'pending', dep1?.approvalStatus)

    // liga o interruptor para o resto do teste
    await prisma.eventConfig.update({ where: { id: cfg.id }, data: { standApprovalEnabled: true } })

    console.log('\n=== 2) escopo ===')
    const rReg = fakeReqRes({ token: tkRegisterA, participantId: p1.id, acao: 'approve' })
    await handler(rReg.req, rReg.res)
    check('token register nao aprova', rReg.res.statusCode === 403, rReg.res.statusCode)

    const pB = await mkP(standB.id)
    const rB = fakeReqRes({ token: tkManageA, participantId: pB.id, acao: 'approve' })
    await handler(rB.req, rB.res)
    check('nao alcanca participante de OUTRO stand', rB.res.statusCode === 404, rB.res.statusCode)
    const depB = await prisma.participant.findUnique({ where: { id: pB.id }, select: { approvalStatus: true } })
    check('o de outro stand segue pending', depB?.approvalStatus === 'pending', depB?.approvalStatus)

    console.log('\n=== 3) aprovacao normal passa pelo NUCLEO ===')
    const rOk = fakeReqRes({ token: tkManageA, participantId: p1.id, acao: 'approve' })
    await handler(rOk.req, rOk.res)
    check('200', rOk.res.statusCode === 200, rOk.res.payload?.message)
    const dep = await prisma.participant.findUnique({
      where: { id: p1.id },
      select: { approvalStatus: true, approvedBy: true, employeeNo: true, _count: { select: { terminalSyncs: true } } }
    })
    check('aprovado', dep?.approvalStatus === 'approved')
    check('approvedBy = e-mail do gestor', dep?.approvedBy === 'gestor-A@teste.local', dep?.approvedBy)
    check('FAN-OUT: employeeNo atribuido', !!dep?.employeeNo, dep?.employeeNo)
    check('FAN-OUT: linha de sync criada', (dep?._count.terminalSyncs ?? 0) === 1)
    const log = await prisma.auditLog.findFirst({
      where: { targetParticipantId: p1.id, action: 'APPROVE' },
      select: { actorType: true, actorIdentifier: true }
    })
    check('audit com actorType=stand_responsible', log?.actorType === 'stand_responsible', log?.actorType)

    console.log('\n=== 4) captureAnyway exige confirmacao ===')
    const pAny = await mkP(standA.id, { customData: { __faceUnvalidated: true } })
    const rAny = fakeReqRes({ token: tkManageA, participantId: pAny.id, acao: 'approve' })
    await handler(rAny.req, rAny.res)
    check('428 pedindo confirmacao', rAny.res.statusCode === 428, rAny.res.statusCode)
    check('diz qual confirmacao', rAny.res.payload?.precisaConfirmar === 'foto-nao-validada')
    const depAny1 = await prisma.participant.findUnique({ where: { id: pAny.id }, select: { approvalStatus: true } })
    check('nada gravado sem confirmar', depAny1?.approvalStatus === 'pending', depAny1?.approvalStatus)

    const rAny2 = fakeReqRes({ token: tkManageA, participantId: pAny.id, acao: 'approve', confirmaFotoNaoValidada: true })
    await handler(rAny2.req, rAny2.res)
    check('confirmado, aprova', rAny2.res.statusCode === 200, rAny2.res.statusCode)

    console.log('\n=== 5) rejeitar NAO e excluir ===')
    const pRej = await mkP(standA.id)
    const rRej = fakeReqRes({ token: tkManageA, participantId: pRej.id, acao: 'reject' })
    await handler(rRej.req, rRej.res)
    check('200', rRej.res.statusCode === 200)
    const depRej = await prisma.participant.findUnique({
      where: { id: pRej.id },
      select: { approvalStatus: true, status: true, isDeleted: true, faceData: true, removedAt: true }
    })
    check('approvalStatus=rejected', depRej?.approvalStatus === 'rejected', depRej?.approvalStatus)
    check('CONTINUA active (nao virou removido)', depRej?.status === 'active', depRej?.status)
    check('nao foi marcado como deletado', depRej?.isDeleted === false)
    check('BIOMETRIA INTACTA (o remover apagaria)', depRej?.faceData !== null)
    check('sem removedAt', depRej?.removedAt === null, depRej?.removedAt)
    const standDep = await prisma.stand.findUnique({ where: { id: standA.id }, select: { substitutionsUsed: true } })
    check('nao consumiu cota de substituicao', (standDep?.substitutionsUsed ?? 0) === 0, standDep?.substitutionsUsed)

    const rVolta = fakeReqRes({ token: tkManageA, participantId: pRej.id, acao: 'approve' })
    await handler(rVolta.req, rVolta.res)
    const depVolta = await prisma.participant.findUnique({ where: { id: pRej.id }, select: { approvalStatus: true } })
    check('rejeitado pode ser aprovado depois', depVolta?.approvalStatus === 'approved', depVolta?.approvalStatus)

    console.log('\n=== 6) sem biometria: a regra do nucleo vale para o gestor ===')
    const pSemFoto = await mkP(standA.id, { faceData: null })
    const rSem = fakeReqRes({ token: tkManageA, participantId: pSemFoto.id, acao: 'approve' })
    await handler(rSem.req, rSem.res)
    check('422 sem-biometria', rSem.res.statusCode === 422, rSem.res.statusCode)
    check('mensagem do nucleo', typeof rSem.res.payload?.message === 'string' && rSem.res.payload.message.includes('sem foto'))

  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.approvalLog.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.participant.deleteMany({ where: { id: { in: criados.participants } } })
    await prisma.standAccessToken.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.auditLog.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.stand.deleteMany({ where: { id: { in: criados.stands } } })
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: criados.terminals } } })
    await prisma.terminal.deleteMany({ where: { id: { in: criados.terminals } } })
    await prisma.auditLog.deleteMany({ where: { eventId: { in: criados.events } } })
    await prisma.eventConfig.deleteMany({ where: { eventId: { in: criados.events } } })
    await prisma.event.deleteMany({ where: { id: { in: criados.events } } })
    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S)'} ===`)
    await prisma.$disconnect()
    process.exit(falhas === 0 ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
