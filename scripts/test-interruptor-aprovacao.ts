/**
 * Interruptores do evento auditados — PATCH /api/admin/eventos/[slug].
 *
 * "Aprovação pelo responsável do stand" (standApprovalEnabled) muda QUEM dá
 * acesso físico; "Aceitar documento estrangeiro" (allowForeignDocument) muda
 * QUEM pode se cadastrar. O teste fixa:
 *
 *   1. AUTORIZAÇÃO NO SERVIDOR: sem sessão 401; ADMIN de evento (mesmo com
 *      canEdit) 403 — é a mesma régua das outras configs do evento (SUPER_ADMIN).
 *      Nenhuma recusa escreve nada.
 *   2. Evento SEM EventConfig: ligar cria a linha com os padrões atuais.
 *   3. AUDIT: cada mudança vira EVENT_CONFIG_CHANGED com quem/antes/depois;
 *      salvar sem mudar não gera linha; valor não booleano é 400.
 *   4. LIGADO: o painel de gestão mostra "Aprovar" e /api/stand-approval aceita.
 *   5. DESLIGADO: o botão some, /api/stand-approval recusa, a aprovação já
 *      feita continua, o pendente continua pendente — e a organização ainda
 *      aprova pelo painel do admin.
 *
 * A sessão é um JWT do NextAuth assinado com o NEXTAUTH_SECRET local: o
 * handler roda o getServerSession DE VERDADE, nada de mock da checagem.
 *
 * O item 4/5 do painel faz GET no dev server; ele precisa estar no MESMO banco:
 *   .\scripts\testar.ps1 -Comando 'npm run dev'        (outro terminal)
 *   .\scripts\testar.ps1 scripts\test-interruptor-aprovacao.ts
 * Sem dev server no ar, essas checagens FALHAM (não são puladas).
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-interruptor-aprovacao.ts')

import { encode } from 'next-auth/jwt'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { generateStandAccessToken } from '../lib/stand-access/tokens'
import eventoHandler from '../pages/api/admin/eventos/[slug]'
import standApprovalHandler from '../pages/api/stand-approval'
import adminApprovalHandler from '../pages/api/admin/participant-approval'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const SUF = `int-${Date.now()}`
const FACE = encryptString('data:image/jpeg;base64,/9j/FAKE-' + SUF)

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

async function cookieDe(user: any) {
  const jwt = await encode({
    token: { name: user.name, email: user.email, sub: user.id, id: user.id, role: user.role, events: user.events },
    secret: process.env.NEXTAUTH_SECRET!
  })
  return { 'next-auth.session-token': jwt, '__Secure-next-auth.session-token': jwt }
}

function fakeReqRes(method: string, body: any, opts: { query?: any; cookies?: any } = {}) {
  const cookies = opts.cookies ?? {}
  const req: any = {
    method, body, query: opts.query ?? {}, cookies,
    headers: {
      'x-forwarded-for': '10.2.0.7', 'user-agent': 'teste-interruptor',
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    socket: { remoteAddress: '10.2.0.7' }
  }
  const res: any = {
    statusCode: 0, payload: null as any, headers: {} as any,
    setHeader(k: string, v: string) { this.headers[k] = v; return this },
    getHeader(k: string) { return this.headers[k] },
    status(c: number) { this.statusCode = c; return this },
    json(p: any) { this.payload = p; return this },
    send(p: any) { this.payload = p; return this },
    end() { return this }
  }
  return { req, res }
}

async function patch(slug: string, body: any, cookies?: any) {
  const r = fakeReqRes('PATCH', body, { query: { slug }, cookies })
  await eventoHandler(r.req, r.res)
  return r.res
}

/** Quantos botões "Aprovar" o painel de gestão renderiza (SSR). */
async function botoesAprovar(token: string): Promise<number | null> {
  try {
    const html = await (await fetch(`${BASE}/stand/${token}`, { cache: 'no-store' })).text()
    return (html.match(/>Aprovar<\/button>/g) ?? []).length
  } catch {
    return null
  }
}

async function main() {
  const criados: any = { events: [], stands: [], participants: [], admins: [] }
  try {
    const agora = new Date()
    const ev = await prisma.event.create({
      data: {
        name: 'INTERRUPTOR APROV', slug: `ia-${SUF}`, code: `IA-${SUF}`.slice(0, 20),
        startDate: agora, endDate: new Date(agora.getTime() + 30 * 86400000),
        requiresApprovalForAccess: true
      }
    })
    criados.events.push(ev.id)
    // De propósito SEM EventConfig: o PATCH tem que criar.

    const stand = await prisma.stand.create({
      data: {
        eventId: ev.id, name: 'Stand IA', code: `IA-${SUF}`.slice(0, 24),
        maxRegistrations: 10, isActive: true, responsibleEmail: 'gestor-ia@teste.local'
      }
    })
    criados.stands.push(stand.id)
    const { token: tkManage } = await generateStandAccessToken(
      stand.id, { adminId: null, adminEmail: 'admin@teste.local' }, 'manage'
    )

    let seq = 0
    const mkP = async () => {
      seq++
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, standId: stand.id, name: `P${seq}-${SUF}`.slice(0, 40),
          cpf: `${Date.now()}${seq}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'pending', faceData: FACE
        }
      })
      criados.participants.push(p.id)
      return p
    }
    const pJaAprovado = await mkP()
    const pPendente = await mkP()

    const superRow = await prisma.eventAdmin.create({
      data: { name: 'Super Teste', email: `super-${SUF}@teste.local`, password: 'x', role: 'SUPER_ADMIN' }
    })
    criados.admins.push(superRow.id)
    const SUPER = await cookieDe({ ...superRow, events: [] })
    const ADMIN_DO_EVENTO = await cookieDe({
      id: 'admin-fake', name: 'Admin Evento', email: `admin-${SUF}@teste.local`, role: 'ADMIN',
      events: [{
        id: ev.id, slug: ev.slug,
        permissions: { canView: true, canEdit: true, canApprove: true, canManageStands: true }
      }]
    })

    const audits = () => prisma.auditLog.findMany({
      where: { eventId: ev.id, action: 'EVENT_CONFIG_CHANGED' },
      orderBy: { createdAt: 'asc' }
    })
    const cfg = () => prisma.eventConfig.findUnique({ where: { eventId: ev.id } })

    console.log('\n=== 1) autorização no servidor ===')
    const rAnon = await patch(ev.slug, { standApprovalEnabled: true })
    check('sem sessão: 401', rAnon.statusCode === 401, rAnon.statusCode)
    const rAdm = await patch(ev.slug, { standApprovalEnabled: true }, ADMIN_DO_EVENTO)
    check('ADMIN do evento (canEdit): 403', rAdm.statusCode === 403, rAdm.statusCode)
    check('recusa não criou EventConfig', (await cfg()) === null)
    check('recusa não gerou audit', (await audits()).length === 0)

    console.log('\n=== 2) ligar em evento sem EventConfig cria com os padrões ===')
    const rBad = await patch(ev.slug, { standApprovalEnabled: 'true' }, SUPER)
    check('string "true" é 400', rBad.statusCode === 400, rBad.statusCode)
    check('400 não criou EventConfig', (await cfg()) === null)

    const rOn = await patch(ev.slug, { standApprovalEnabled: true }, SUPER)
    check('SUPER_ADMIN liga: 200', rOn.statusCode === 200, rOn.payload?.error)
    const c1 = await cfg()
    check('EventConfig criado com standApprovalEnabled=true', c1?.standApprovalEnabled === true)
    check('padrões preservados (requireFace, requireConsent, autoApprove, estrangeiro)',
      c1?.requireFace === true && c1?.requireConsent === true &&
      c1?.autoApprove === false && c1?.allowForeignDocument === false,
      { requireFace: c1?.requireFace, requireConsent: c1?.requireConsent, autoApprove: c1?.autoApprove, allowForeignDocument: c1?.allowForeignDocument })

    let a = await audits()
    check('1 linha EVENT_CONFIG_CHANGED', a.length === 1, a.length)
    check('audit: quem', a[0]?.adminEmail === superRow.email && a[0]?.actorType === 'admin', a[0]?.adminEmail)
    check('audit: antes false / depois true',
      (a[0]?.previousData as any)?.standApprovalEnabled === false && (a[0]?.newData as any)?.standApprovalEnabled === true)
    check('audit: quando (createdAt preenchido)', a[0]?.createdAt instanceof Date)
    check('audit: ip e user-agent', a[0]?.ip === '10.2.0.7' && a[0]?.userAgent === 'teste-interruptor')
    console.log('   descrição:', a[0]?.description)

    console.log('\n=== 3) LIGADO: painel mostra o botão, gestor aprova ===')
    const ap = fakeReqRes('POST', { token: tkManage, participantId: pJaAprovado.id, acao: 'approve' })
    await standApprovalHandler(ap.req, ap.res)
    check('/api/stand-approval aceita com ligado', ap.res.statusCode === 200, ap.res.payload?.message)
    const nOn = await botoesAprovar(tkManage)
    check('painel de gestão mostra "Aprovar" (1 pendente)', nOn === 1, nOn ?? 'dev server fora do ar')

    console.log('\n=== 4) salvar o form sem mudar nada não gera audit ===')
    // O form manda TODOS os campos: simula isso.
    const rSame = await patch(ev.slug, { standApprovalEnabled: true, allowForeignDocument: false, requireFace: true }, SUPER)
    check('200', rSame.statusCode === 200)
    check('continua 1 linha de audit', (await audits()).length === 1, (await audits()).length)

    console.log('\n=== 5) DESLIGADO ===')
    const rAdmOff = await patch(ev.slug, { standApprovalEnabled: false }, ADMIN_DO_EVENTO)
    check('ADMIN do evento não desliga: 403', rAdmOff.statusCode === 403)
    check('...e segue ligado', (await cfg())?.standApprovalEnabled === true)

    const rOff = await patch(ev.slug, { standApprovalEnabled: false }, SUPER)
    check('SUPER_ADMIN desliga: 200', rOff.statusCode === 200)
    check('standApprovalEnabled=false', (await cfg())?.standApprovalEnabled === false)
    a = await audits()
    check('2ª linha de audit, true → false', a.length === 2 &&
      (a[1]?.previousData as any)?.standApprovalEnabled === true && (a[1]?.newData as any)?.standApprovalEnabled === false)

    const depJa = await prisma.participant.findUnique({ where: { id: pJaAprovado.id }, select: { approvalStatus: true } })
    check('aprovação já feita NÃO mudou', depJa?.approvalStatus === 'approved', depJa?.approvalStatus)
    const depPend = await prisma.participant.findUnique({ where: { id: pPendente.id }, select: { approvalStatus: true } })
    check('pendente continua pendente', depPend?.approvalStatus === 'pending', depPend?.approvalStatus)

    const apOff = fakeReqRes('POST', { token: tkManage, participantId: pPendente.id, acao: 'approve' })
    await standApprovalHandler(apOff.req, apOff.res)
    check('/api/stand-approval recusa com desligado (403)', apOff.res.statusCode === 403, apOff.res.statusCode)
    const nOff = await botoesAprovar(tkManage)
    check('painel de gestão esconde "Aprovar"', nOff === 0, nOff ?? 'dev server fora do ar')

    const adm = fakeReqRes('POST', { participantId: pPendente.id, action: 'approve' }, { cookies: SUPER })
    await adminApprovalHandler(adm.req, adm.res)
    check('organização ainda aprova pelo painel do admin', adm.res.statusCode === 200, adm.res.payload?.error)

    console.log('\n=== 6) Aceitar documento estrangeiro: mesma régua ===')
    const rFAdm = await patch(ev.slug, { allowForeignDocument: true }, ADMIN_DO_EVENTO)
    check('ADMIN do evento: 403', rFAdm.statusCode === 403)
    const rFOn = await patch(ev.slug, { allowForeignDocument: true }, SUPER)
    check('SUPER_ADMIN liga: 200', rFOn.statusCode === 200 && (await cfg())?.allowForeignDocument === true)
    const rFOff = await patch(ev.slug, { allowForeignDocument: false }, SUPER)
    check('SUPER_ADMIN desliga: 200', rFOff.statusCode === 200 && (await cfg())?.allowForeignDocument === false)
    a = await audits()
    const est = a.filter((x) => (x.newData as any)?.allowForeignDocument !== undefined)
    check('2 linhas de audit do estrangeiro (liga, desliga)', est.length === 2 &&
      (est[0].newData as any).allowForeignDocument === true && (est[1].newData as any).allowForeignDocument === false,
      est.length)
    check('não mexeu no interruptor de aprovação', (await cfg())?.standApprovalEnabled === false)
  } catch (e) {
    // Sem isto, uma exceção no meio caía no finally e imprimia "TODOS PASSARAM".
    console.error(e)
    falhas++
  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.approvalLog.deleteMany({ where: { participantId: { in: criados.participants } } })
    await prisma.participant.deleteMany({ where: { id: { in: criados.participants } } })
    await prisma.standAccessToken.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.auditLog.deleteMany({ where: { standId: { in: criados.stands } } })
    await prisma.stand.deleteMany({ where: { id: { in: criados.stands } } })
    await prisma.auditLog.deleteMany({ where: { eventId: { in: criados.events } } })
    await prisma.auditLog.deleteMany({ where: { adminId: { in: criados.admins } } })
    await prisma.eventConfig.deleteMany({ where: { eventId: { in: criados.events } } })
    await prisma.event.deleteMany({ where: { id: { in: criados.events } } })
    await prisma.eventAdmin.deleteMany({ where: { id: { in: criados.admins } } })
    console.log(`\n=== RESULTADO: ${falhas === 0 ? 'TODOS PASSARAM ✓' : falhas + ' FALHA(S)'} ===`)
    await prisma.$disconnect()
    process.exit(falhas === 0 ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
