/**
 * Teste do BALCÃO de recoleta facial e da trava de evento do edit-link.
 *
 *   1) gestão dos links: 401/403, validação, geração, auditoria
 *   2) página /balcao/[token]: vale com link bom, 404 com lixo
 *   3) busca SÓ por documento: CPF formatado, documento estrangeiro, ambiguidade,
 *      removido e outro evento invisíveis, e nada de CPF inteiro/id/contato
 *   4) troca: conferência obrigatória, 413 de foto grande, APROVAÇÃO MANTIDA,
 *      audit com faceVersion antes/depois, linhas de sync de volta a pending
 *   5) terminais: pendente → ok pela faceVersion; recusa ANTIGA ignorada,
 *      recusa nova vira "recusada"
 *   6) revogação: o link para na chamada seguinte
 *   7) edit-link: exige canEdit NO evento do participante
 *
 * Fotos SINTÉTICAS. Requer o dev server no ar apontado para o banco de teste.
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-balcao.ts')

import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { faceVersionOf } from '../lib/face/version'
import { createAllocation } from '../lib/terminals/allocation'
import { validadeDoBalcao } from '../lib/balcao/acesso'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = Date.now().toString().slice(-6)
const SENHA = `Balcao-${SUF}-${Math.random().toString(36).slice(2)}`

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function foto(cor: string, grande = false): Promise<string> {
  if (grande) {
    // Ruído 640×640: bem acima dos 200 KB do FDLib e ABAIXO do 1 MB de corpo do
    // Next — senão quem responde 413 é o Next, sem passar pela nossa barreira.
    const px = Buffer.alloc(640 * 640 * 3)
    let x = 12345
    for (let i = 0; i < px.length; i++) { x = (x * 1103515245 + 12345) >>> 0; px[i] = x >>> 24 }
    const jpg = await sharp(px, { raw: { width: 640, height: 640, channels: 3 } }).jpeg({ quality: 92 }).toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${cor}"/><circle cx="300" cy="360" r="190" fill="#f0d0b0"/></svg>`
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

function cliente() {
  const jar: Record<string, string> = {}
  const absorb = (res: Response) => {
    for (const c of (res.headers as any).getSetCookie?.() ?? []) {
      const kv = c.split(';')[0]; const i = kv.indexOf('=')
      if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1)
    }
  }
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async login(email: string) {
      const r = await fetch(`${BASE}/api/auth/csrf`); absorb(r)
      const { csrfToken } = await r.json()
      const cb = await fetch(`${BASE}/api/auth/callback/credentials`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
        body: new URLSearchParams({ csrfToken, email, password: SENHA, callbackUrl: `${BASE}/admin`, json: 'true' })
      })
      absorb(cb)
      return Object.keys(jar).some((k) => k.includes('session-token'))
    },
    async req(method: string, path: string, body?: any) {
      const res = await fetch(BASE + path, {
        method,
        headers: { Cookie: cookie(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
      let json: any = null
      try { json = await res.json() } catch {}
      return { status: res.status, json }
    }
  }
}
const anonimo = cliente()
const balcao = (token: string, rota: string, body: any) => anonimo.req('POST', `/api/balcao/${token}/${rota}`, body)

async function main() {
  const c = { events: [] as string[], admins: [] as string[], participants: [] as string[], terminals: [] as string[] }
  try {
    const now = new Date()
    const mkEv = (n: string) => prisma.event.create({ data: { name: `BALCAO ${n} ${SUF}`, slug: `balcao-${n}-${SUF}`, code: `BAL-${n}-${SUF}`, status: 'active', startDate: now, endDate: new Date(now.getTime() + 5 * 86400000), requiresApprovalForAccess: true } })
    const evE = await mkEv('e'); c.events.push(evE.id)
    const evF = await mkEv('f'); c.events.push(evF.id)

    const fotoAntiga = await foto('#2255aa')
    const versaoAntiga = faceVersionOf(fotoAntiga)
    let n = 0
    const cpf = () => `7${SUF}${String(n++).padStart(4, '0')}`.slice(-11)
    const mkP = async (eventId: string, extra: any) => {
      const p = await prisma.participant.create({ data: { eventId, name: `Balcao Teste ${n}`, cpf: cpf(), phone: '51999990000', email: `p${n}@teste.local`, status: 'active', isDeleted: false, approvalStatus: 'approved', faceData: encryptString(fotoAntiga), faceVersion: versaoAntiga, ...extra } })
      c.participants.push(p.id)
      return p
    }
    const pA = await mkP(evE.id, { employeeNo: `9${SUF}1`.slice(-8) })
    const pPend = await mkP(evE.id, { approvalStatus: 'pending' })
    const pRem = await mkP(evE.id, { status: 'removed' })
    const pF = await mkP(evF.id, {})
    const pEstr = await mkP(evE.id, { cpf: `PP-AR:ZX${SUF}1` })
    await mkP(evE.id, { cpf: `PP-AR:QW${SUF}2` })
    await mkP(evE.id, { cpf: `PP-PY:QW${SUF}2` })

    // Dois terminais alocados ao evento E, com a foto ANTIGA já sincronizada.
    const terms = []
    for (const i of [1, 2]) {
      const t = await prisma.terminal.create({ data: { name: `BAL ${SUF} ${i}`, ipAddress: `10.95.${SUF.slice(-2)}.${i}`, isActive: true, passwordEncrypted: encryptString('x') } })
      c.terminals.push(t.id); terms.push(t)
      await createAllocation({ terminalId: t.id, eventId: evE.id, startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 5 * 86400000) })
      await prisma.participantTerminalSync.create({ data: { participantId: pA.id, terminalId: t.id, faceState: 'synced', cardState: 'na', removalState: 'none', faceVersion: versaoAntiga } })
    }

    const hash = await bcrypt.hash(SENHA, 10)
    const mkAdmin = async (tag: string, eventId: string, perms: any) => {
      const a = await prisma.eventAdmin.create({ data: { name: `Bal ${tag}`, email: `bal-${tag}-${SUF}@teste.local`, password: hash, role: 'ADMIN', isActive: true } })
      c.admins.push(a.id)
      await prisma.eventAdminAccess.create({ data: { adminId: a.id, eventId, canView: true, ...perms } })
      return a
    }
    const gestor = await mkAdmin('gestor', evE.id, { canManageAdmins: true, canEdit: true })
    const soVe = await mkAdmin('ve', evE.id, {})
    const outroEv = await mkAdmin('outro', evF.id, { canEdit: true, canManageAdmins: true })

    const g = cliente(); check('login gestor', await g.login(gestor.email))
    const v = cliente(); check('login admin só-ver', await v.login(soVe.email))
    const o = cliente(); check('login admin de outro evento', await o.login(outroEv.email))
    const rotaLinks = `/api/admin/eventos/${evE.slug}/balcao-links`

    console.log('\n=== 0) validade do link ===')
    const agoraFixo = new Date('2026-10-01T12:00:00Z')
    const iso = (d: Date) => d.toISOString()
    check('Expofest (19/10 12:00 UTC) → 19/10 23:59:59 Brasília', iso(validadeDoBalcao(new Date('2026-10-19T12:00:00Z'), agoraFixo)) === '2026-10-20T02:59:59.999Z')
    check('01:00 UTC ainda é o dia ANTERIOR em Brasília', iso(validadeDoBalcao(new Date('2026-10-20T01:00:00Z'), agoraFixo)) === '2026-10-20T02:59:59.999Z')
    check('evento encerrado → 12h a partir de agora', iso(validadeDoBalcao(new Date('2026-09-01T12:00:00Z'), agoraFixo)) === '2026-10-02T00:00:00.000Z')

    console.log('\n=== 1) gestão dos links ===')
    check('sem sessão → 401', (await anonimo.req('GET', rotaLinks)).status === 401)
    check('sem canManageAdmins → 403', (await v.req('GET', rotaLinks)).status === 403)
    check('admin de outro evento → 403', (await o.req('GET', rotaLinks)).status === 403)
    check('label curto → 400', (await g.req('POST', rotaLinks, { label: 'ab' })).status === 400)
    const gerado = await g.req('POST', rotaLinks, { label: `Operadora ${SUF}` })
    check('gera link → 201', gerado.status === 201, gerado.status)
    const token = String(gerado.json?.link ?? '').split('/balcao/')[1] ?? ''
    check('link com token no formato', /^[A-Za-z0-9_-]{43}$/.test(token))
    const expira = new Date(gerado.json?.expiresAt)
    const diaFim = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(evE.endDate)
    check('expira às 23:59:59 (Brasília) do último dia', expira.getTime() === new Date(`${diaFim}T23:59:59.999-03:00`).getTime(), gerado.json?.expiresAt)
    const lista = await g.req('GET', rotaLinks)
    check('lista mostra ativo, sem token/hash', lista.json?.links?.length === 1 && lista.json.links[0].ativo === true && !JSON.stringify(lista.json).includes(token) && !('tokenHash' in lista.json.links[0]))
    check('audit BALCAO_LINK_GERADO', !!(await prisma.auditLog.findFirst({ where: { eventId: evE.id, action: 'BALCAO_LINK_GERADO' } })))

    console.log('\n=== 2) página ===')
    check('/balcao/<token> → 200', (await fetch(`${BASE}/balcao/${token}`)).status === 200)
    check('/balcao/lixo → 404', (await fetch(`${BASE}/balcao/${'x'.repeat(43)}`)).status === 404)

    console.log('\n=== 3) busca ===')
    const lixo = await balcao('y'.repeat(43), 'buscar', { documento: pA.cpf })
    check('token inválido → 404 sem "nao-encontrado"', lixo.status === 404 && lixo.json?.error !== 'nao-encontrado')
    const formatado = pA.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    const b = await balcao(token, 'buscar', { documento: formatado })
    check('CPF formatado → 200', b.status === 200, b.status)
    check('nome e stand', b.json?.pessoa?.nome === pA.name)
    check('documento mascarado', /^\d{3}\.\*\*\*\.\*\*\*-\d{2}$/.test(b.json?.pessoa?.documento ?? ''), b.json?.pessoa?.documento)
    const bruto = JSON.stringify(b.json ?? {})
    check('sem CPF inteiro, id, telefone ou e-mail', !bruto.includes(pA.cpf) && !bruto.includes(pA.id) && !bruto.includes('51999990000') && !bruto.includes('@teste.local'))
    check('foto atual para conferência (WebP)', (b.json?.pessoa?.fotoAtual ?? '').startsWith('data:image/webp;base64,'))
    check('terminais antes: ok (foto antiga em 2/2)', b.json?.terminais?.estado === 'ok' && b.json.terminais.terminais === 2, b.json?.terminais)
    check('audit BALCAO_BUSCA', !!(await prisma.auditLog.findFirst({ where: { action: 'BALCAO_BUSCA', targetParticipantId: pA.id } })))
    check('removido → 404 nao-encontrado', (await balcao(token, 'buscar', { documento: pRem.cpf })).json?.error === 'nao-encontrado')
    check('CPF de outro evento → 404', (await balcao(token, 'buscar', { documento: pF.cpf })).status === 404)
    check('documento estrangeiro pelo número solto', (await balcao(token, 'buscar', { documento: `ZX${SUF}1` })).json?.pessoa?.nome === pEstr.name)
    const amb = await balcao(token, 'buscar', { documento: `QW${SUF}2` })
    check('número em dois países → 409 com instrução', amb.status === 409 && /Pergunte o país/.test(amb.json?.message ?? ''), amb.status)
    check('identidade completa resolve a ambiguidade', (await balcao(token, 'buscar', { documento: `PP-PY:QW${SUF}2` })).status === 200)
    check('nome NÃO busca', (await balcao(token, 'buscar', { documento: pA.name })).status === 404)
    check('id do participante NÃO busca', (await balcao(token, 'buscar', { documento: pA.id })).status === 404)

    console.log('\n=== 4) troca de foto ===')
    const nova = await foto('#aa3322')
    check('sem conferiu → 400', (await balcao(token, 'trocar-foto', { documento: pA.cpf, faceImage: nova })).status === 400)
    check('sem foto → 400', (await balcao(token, 'trocar-foto', { documento: pA.cpf, conferiu: true })).status === 400)
    const grande = await foto('', true)
    const r413 = await balcao(token, 'trocar-foto', { documento: pA.cpf, faceImage: grande, conferiu: true })
    check('foto > 200 KB → 413 da NOSSA barreira', r413.status === 413 && r413.json?.error === 'Face image too large', { status: r413.status, KB: Math.round(grande.length / 1024), erro: r413.json?.error })
    const t = await balcao(token, 'trocar-foto', { documento: pA.cpf, faceImage: nova, faceData: { faceCaptureMode: 'auto', faceInterocularPx: 110 }, conferiu: true })
    check('troca → 200', t.status === 200 && !!t.json?.trocadaEm, t.status)
    const depois = await prisma.participant.findUnique({ where: { id: pA.id }, select: { approvalStatus: true, faceVersion: true, faceInterocularPx: true } })
    check('APROVAÇÃO MANTIDA', depois?.approvalStatus === 'approved', depois?.approvalStatus)
    check('faceVersion nova = hash da foto nova', depois?.faceVersion === faceVersionOf(nova))
    const aud = await prisma.auditLog.findFirst({ where: { action: 'BALCAO_FOTO_TROCADA', targetParticipantId: pA.id } })
    const md: any = aud?.metadata ?? {}
    check('audit: antes, depois, operador, aprovação', md.faceVersionAntes === versaoAntiga && md.faceVersionDepois === depois?.faceVersion && md.operador === `Operadora ${SUF}` && md.aprovacaoMantida === 'approved' && md.conferiuDocumento === true)
    const linhas = await prisma.participantTerminalSync.findMany({ where: { participantId: pA.id } })
    check('linhas de sync de volta a pending', linhas.length === 2 && linhas.every((l) => l.faceState === 'pending' && l.attempts === 0))

    console.log('\n=== 5) terminais ===')
    const desde = t.json.trocadaEm
    const est = async () => (await balcao(token, 'terminais', { documento: pA.cpf, desde })).json?.terminais
    check('logo após: pendente 0/2', (await est())?.estado === 'pendente')
    // recusa ANTIGA (antes da troca) não conta
    await prisma.participantTerminalSync.update({ where: { id: linhas[0].id }, data: { faceState: 'failed', lastError: 'SubpicAnalysisModelingError', lastAttemptAt: new Date(new Date(desde).getTime() - 60_000) } })
    check('recusa anterior à troca é ignorada', (await est())?.estado === 'pendente')
    // synced com a versão ANTIGA não conta como chegou
    await prisma.participantTerminalSync.update({ where: { id: linhas[0].id }, data: { faceState: 'synced', faceVersion: versaoAntiga, lastError: null } })
    const e1 = await est()
    check('synced com versão antiga não conta', e1?.estado === 'pendente' && e1?.chegou === 0, e1)
    await prisma.participantTerminalSync.update({ where: { id: linhas[0].id }, data: { faceVersion: depois!.faceVersion } })
    const e2 = await est()
    check('1 de 2 com a versão nova', e2?.estado === 'pendente' && e2?.chegou === 1, e2)
    await prisma.participantTerminalSync.update({ where: { id: linhas[1].id }, data: { faceState: 'failed', lastError: 'statusCode=6 subStatusCode=SubpicAnalysisModelingError', lastAttemptAt: new Date() } })
    const e3 = await est()
    check('recusa nova → "recusada", motivo modelagem', e3?.estado === 'recusada' && e3?.motivo === 'modelagem' && e3?.recusaram === 1, e3)
    await prisma.participantTerminalSync.update({ where: { id: linhas[1].id }, data: { faceState: 'synced', faceVersion: depois!.faceVersion, lastError: null } })
    check('2 de 2 → ok', (await est())?.estado === 'ok')
    const tp = await balcao(token, 'trocar-foto', { documento: pPend.cpf, faceImage: nova, conferiu: true })
    check('pendente: troca aceita', tp.status === 200)
    check('pendente: continua pendente', (await prisma.participant.findUnique({ where: { id: pPend.id } }))?.approvalStatus === 'pending')
    check('pendente: terminais → nao-aprovado', (await balcao(token, 'terminais', { documento: pPend.cpf })).json?.terminais?.estado === 'nao-aprovado')

    console.log('\n=== 6) revogação ===')
    const idLink = lista.json.links[0].id
    check('revoga → 200', (await g.req('DELETE', rotaLinks, { id: idLink })).status === 200)
    const posRev = await balcao(token, 'buscar', { documento: pA.cpf })
    check('próxima chamada já falha (404)', posRev.status === 404 && posRev.json?.error !== 'nao-encontrado', posRev.status)
    check('página também', (await fetch(`${BASE}/balcao/${token}`)).status === 404)
    check('audit BALCAO_LINK_REVOGADO', !!(await prisma.auditLog.findFirst({ where: { eventId: evE.id, action: 'BALCAO_LINK_REVOGADO' } })))
    const l2 = await g.req('GET', rotaLinks)
    check('lista mostra inativo, com quem revogou', l2.json?.links?.[0]?.ativo === false && l2.json.links[0].revokedBy === gestor.email)

    console.log('\n=== 7) edit-link com trava de evento ===')
    const rotaEdit = `/api/admin/participants/${pA.id}/edit-link`
    check('admin de outro evento → 404', (await o.req('POST', rotaEdit)).status === 404)
    check('admin do evento sem canEdit → 404', (await v.req('POST', rotaEdit)).status === 404)
    const ok = await g.req('POST', rotaEdit)
    check('admin com canEdit no evento → 200', ok.status === 200 && typeof ok.json?.url === 'string', ok.status)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.participantEditToken.deleteMany({ where: { participantId: { in: c.participants } } }).catch(() => {})
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: c.participants } } }).catch(() => {})
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: c.terminals } } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { OR: [{ eventId: { in: c.events } }, { adminId: { in: c.admins } }] } }).catch(() => {})
    await prisma.eventAdminAccess.deleteMany({ where: { adminId: { in: c.admins } } }).catch(() => {})
    await prisma.eventAdmin.deleteMany({ where: { id: { in: c.admins } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: c.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: c.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: c.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
