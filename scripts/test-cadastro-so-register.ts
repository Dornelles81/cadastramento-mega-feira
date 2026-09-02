/**
 * Só o link de CADASTRO cadastra — a trava de scope em /api/stand-registration.
 *
 * Até 2026-09-02 o endpoint aceitava qualquer token válido, inclusive o de
 * gestão, e o painel do responsável tinha um botão apontando para o mesmo
 * token. Repassar o link de gestão à equipe funcionava — e dava a cada pessoa a
 * lista completa do stand (foto e CPF) mais o botão de excluir.
 *
 * O que este teste fixa:
 *   - token `manage` é RECUSADO com 403 e mensagem que diz o que fazer;
 *   - token `register` NÃO é barrado pela trava;
 *   - a recusa acontece ANTES de qualquer escrita (nada de participante órfão);
 *   - `manage` continua valendo para o que é dele: remover e reativar.
 *
 * Requer banco de teste. Uso: .\scripts\testar.ps1 scripts\test-cadastro-so-register.ts
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-cadastro-so-register.ts')

import { prisma } from '../lib/prisma'
import { generateStandAccessToken } from '../lib/stand-access/tokens'
import handlerCadastro from '../pages/api/stand-registration'

const SUF = `trava-${Date.now()}`

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

/** Mock mínimo de req/res: o handler é uma função comum. */
function fakeReqRes(body: any) {
  const req: any = {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}`, 'user-agent': 'teste' },
    socket: { remoteAddress: '10.0.0.1' }
  }
  const res: any = {
    statusCode: 0,
    payload: null as any,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v },
    status(c: number) { this.statusCode = c; return this },
    json(p: any) { this.payload = p; return this },
    end() { return this }
  }
  return { req, res }
}

async function main() {
  const criados: any = { events: [], stands: [], participants: [] }
  try {
    const agora = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'TRAVA TEST', slug: `t-${SUF}`, code: `T-${SUF}`.slice(0, 20),
        startDate: agora, endDate: new Date(agora.getTime() + 30 * 86400000)
      }
    })
    criados.events.push(ev.id)
    const stand = await prisma.stand.create({
      data: {
        eventId: ev.id, name: `Stand ${SUF}`.slice(0, 40), code: `ST-${SUF}`.slice(0, 24),
        maxRegistrations: 10, isActive: true, responsibleEmail: 'gestor@teste.local'
      }
    })
    criados.stands.push(stand.id)

    const ator = { adminId: null, adminEmail: 'admin@teste.local' }
    const { token: tokenManage } = await generateStandAccessToken(stand.id, ator, 'manage')
    const { token: tokenRegister } = await generateStandAccessToken(stand.id, ator, 'register')

    const corpo = (token: string, cpf: string) => ({
      token, name: 'Fulano de Teste', cpf, consent: true
    })

    console.log('\n=== token de GESTAO nao cadastra ===')
    const a = fakeReqRes(corpo(tokenManage, '39053344705'))
    await handlerCadastro(a.req, a.res)
    check('status 403', a.res.statusCode === 403, a.res.statusCode)
    check('mensagem aponta o link de cadastro',
      typeof a.res.payload?.message === 'string' && a.res.payload.message.includes('link de cadastro'),
      a.res.payload?.message)

    const criouAlgo = await prisma.participant.count({ where: { standId: stand.id } })
    check('NADA foi escrito na recusa', criouAlgo === 0, criouAlgo)

    console.log('\n=== token de CADASTRO nao e barrado pela trava ===')
    const b = fakeReqRes(corpo(tokenRegister, '39053344705'))
    await handlerCadastro(b.req, b.res)
    check('nao devolveu 403 de scope', b.res.statusCode !== 403, {
      status: b.res.statusCode, msg: b.res.payload?.message ?? b.res.payload?.error
    })
    const depois = await prisma.participant.findMany({ where: { standId: stand.id }, select: { id: true } })
    criados.participants.push(...depois.map((p) => p.id))
    console.log(`    (participantes criados pelo caminho liberado: ${depois.length})`)

    console.log('\n=== manage continua valendo para o que e dele ===')
    const { validateStandToken } = await import('../lib/stand-access/validate')
    const accMan = await validateStandToken(tokenManage)
    const accReg = await validateStandToken(tokenRegister)
    check('manage segue valido (nao foi revogado)', accMan?.scope === 'manage', accMan?.scope)
    check('register valido', accReg?.scope === 'register', accReg?.scope)
    check('os dois apontam para o MESMO stand', accMan?.stand.id === stand.id && accReg?.stand.id === stand.id)

  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.participant.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.standAccessToken.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.auditLog.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.stand.deleteMany({ where: { id: { in: criados.stands } } })
    await prisma.auditLog.deleteMany({ where: { eventId: { in: criados.events } } })
    await prisma.event.deleteMany({ where: { id: { in: criados.events } } })
    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S)'} ===`)
    await prisma.$disconnect()
    process.exit(falhas === 0 ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
