/**
 * Teste HTTP do CRUD admin de Terminal + AgentToken (Fase 0 Parte 4), com
 * sessão NextAuth real. Cria um admin temporário, autentica pelo fluxo de
 * credenciais (csrf → callback), exercita os endpoints e limpa tudo.
 *
 * Requer o dev server no ar (http://localhost:3000) com NEXTAUTH_SECRET/MASTER_KEY.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = `admincrud-${Date.now()}`
const EMAIL = `admincrud-${Date.now()}@test.local`
const PASSWORD = 'TestPass#123'

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

// --- cookie jar simples sobre fetch ---
const jar: Record<string, string> = {}
function absorb(res: Response) {
  const sc = (res.headers as any).getSetCookie?.() ?? []
  for (const c of sc) {
    const kv = c.split(';')[0]
    const i = kv.indexOf('=')
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1)
  }
}
function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  absorb(csrfRes)
  const { csrfToken } = await csrfRes.json()

  const body = new URLSearchParams({
    csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/admin`, json: 'true'
  })
  const cbRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
    body
  })
  absorb(cbRes)
  return Object.keys(jar).some((k) => k.includes('session-token'))
}

async function api(method: string, path: string, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Cookie: cookieHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  let json: any = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  let eventId = ''
  let adminId = ''
  const cleanupTerminals: string[] = []
  const cleanupTokens: string[] = []
  try {
    const now = new Date()
    const ev = await prisma.event.create({
      data: { name: 'ADMIN CRUD TEST', slug: `ac-${SUF}`, code: `AC-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000) }
    })
    eventId = ev.id
    const admin = await prisma.eventAdmin.create({
      data: { name: 'Admin CRUD Test', email: EMAIL, password: await bcrypt.hash(PASSWORD, 10), role: 'SUPER_ADMIN', isActive: true }
    })
    adminId = admin.id

    console.log('\n=== 0) Gate: sem sessão → 401 ===')
    const unauth = await api('GET', '/api/admin/terminals')
    check('GET /api/admin/terminals sem sessão → 401', unauth.status === 401, unauth.status)

    console.log('\n=== Autenticando admin temporário ===')
    const ok = await login()
    check('login obteve session-token', ok)
    if (!ok) throw new Error('login falhou — abortando')

    console.log('\n=== 1) POST /api/admin/terminals (senha entra criptografada) ===')
    const create = await api('POST', '/api/admin/terminals', {
      name: 'Terminal Bancada', ipAddress: '192.168.1.70', port: 80, username: 'admin', password: 'SenhaBancada#1', eventId, gate: 'Portão 1'
    })
    check('201 criado', create.status === 201, create.status)
    const termId = create.json?.terminal?.id
    if (termId) cleanupTerminals.push(termId)
    check('resposta NÃO vaza passwordEncrypted', !JSON.stringify(create.json).toLowerCase().includes('passwordencrypted'))
    check('hasPassword=true', create.json?.terminal?.hasPassword === true)
    // confirma no banco que está criptografada (não em claro)
    const dbTerm = await prisma.terminal.findUnique({ where: { id: termId } })
    const encOk = !!dbTerm?.passwordEncrypted && !Buffer.from(dbTerm!.passwordEncrypted as any).toString('utf8').includes('SenhaBancada')
    check('senha persistida criptografada (não em claro)', encOk)

    console.log('\n=== 2) GET /api/admin/terminals (lista sem senha) ===')
    const list = await api('GET', `/api/admin/terminals?eventId=${eventId}`)
    check('200 e traz o terminal', list.status === 200 && list.json?.terminals?.some((t: any) => t.id === termId))
    const leaks = (list.json?.terminals ?? []).some((t: any) => 'password' in t || 'passwordEncrypted' in t)
    check('lista não expõe password nem passwordEncrypted (só hasPassword)', !leaks)

    console.log('\n=== 3) PUT /api/admin/terminals/[id] (atualiza, senha preservada se vazia) ===')
    const upd = await api('PUT', `/api/admin/terminals/${termId}`, { name: 'Terminal Bancada (renomeado)', capacityLimit: 1000 })
    check('200 atualizado', upd.status === 200 && upd.json?.terminal?.name === 'Terminal Bancada (renomeado)', upd.json?.terminal?.name)
    const dbTerm2 = await prisma.terminal.findUnique({ where: { id: termId } })
    check('senha preservada (PUT sem password não apaga)', !!dbTerm2?.passwordEncrypted && dbTerm2?.capacityLimit === 1000)

    console.log('\n=== 4) POST /api/admin/agent-tokens (token em claro UMA vez) ===')
    const genTok = await api('POST', '/api/admin/agent-tokens', { eventId, name: 'PC Bancada' })
    check('201', genTok.status === 201, genTok.status)
    const tokenId = genTok.json?.id
    const tokenPlain = genTok.json?.token
    if (tokenId) cleanupTokens.push(tokenId)
    check('retorna token em claro', typeof tokenPlain === 'string' && tokenPlain.length >= 40, tokenPlain?.length)
    // o token em claro NÃO é o que está no banco (lá só o hash)
    const dbTok = await prisma.agentToken.findUnique({ where: { id: tokenId } })
    check('banco guarda só o hash (≠ token em claro)', !!dbTok?.tokenHash && dbTok?.tokenHash !== tokenPlain)

    console.log('\n=== 5) GET /api/admin/agent-tokens (sem hash, status active) ===')
    const listTok = await api('GET', `/api/admin/agent-tokens?eventId=${eventId}`)
    check('200 e traz o token', listTok.status === 200 && listTok.json?.tokens?.some((t: any) => t.id === tokenId))
    check('lista NÃO expõe tokenHash', !JSON.stringify(listTok.json).toLowerCase().includes('tokenhash'))
    check('status=active', listTok.json?.tokens?.find((t: any) => t.id === tokenId)?.status === 'active')

    console.log('\n=== 6) DELETE /api/admin/agent-tokens/[id] (revoga) ===')
    const rev = await api('DELETE', `/api/admin/agent-tokens/${tokenId}`)
    check('200', rev.status === 200, rev.status)
    const dbTokAfter = await prisma.agentToken.findUnique({ where: { id: tokenId } })
    check('revokedAt setado no banco', !!dbTokAfter?.revokedAt)
    const listTok2 = await api('GET', `/api/admin/agent-tokens?eventId=${eventId}`)
    check('status=revoked na listagem', listTok2.json?.tokens?.find((t: any) => t.id === tokenId)?.status === 'revoked')

    console.log('\n=== 7) DELETE /api/admin/terminals/[id] ===')
    const delT = await api('DELETE', `/api/admin/terminals/${termId}`)
    check('200', delT.status === 200, delT.status)
    const gone = await prisma.terminal.findUnique({ where: { id: termId } })
    check('terminal removido do banco', gone === null)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of cleanupTokens) await prisma.agentToken.deleteMany({ where: { id } })
    for (const id of cleanupTerminals) await prisma.terminal.deleteMany({ where: { id } })
    if (eventId) await prisma.auditLog.deleteMany({ where: { eventId } })
    if (adminId) {
      await prisma.auditLog.deleteMany({ where: { adminId } })
      await prisma.eventAdmin.deleteMany({ where: { id: adminId } })
    }
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } })
    await prisma.$disconnect()
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1) })
