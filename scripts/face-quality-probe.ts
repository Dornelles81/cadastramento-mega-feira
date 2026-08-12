/**
 * Sonda empírica de qualidade de face do terminal (Fase 2 — mapeamento).
 * Para cada imagem em FQ_DIR, faz uploadFace pelo fluxo real (agente) num
 * employeeNo de teste limpo, e reporta ACEITA/REJEITA + erro do device.
 * NÃO escreve solução; só mede o que o DS-K1T671M-L tolera. Limpa tudo no fim.
 * Requer dev server no ar.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { HikvisionClient } from '../lib/hikvision/client'
import { revokeAgentToken } from '../lib/agent/tokens'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const DEVICE_IP = process.env.DEVICE_IP || '192.168.1.47'
const DIR = process.env.FQ_DIR || (process.env.TEMP + '/fqtest')
const EMP = '99000777'

const jar: Record<string, string> = {}
function absorb(r: Response) { const sc = (r.headers as any).getSetCookie?.() ?? []; for (const c of sc) { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1) } }
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
async function login(email: string, pw: string) {
  const c = await fetch(`${BASE}/api/auth/csrf`); absorb(c); const { csrfToken } = await c.json()
  const b = new URLSearchParams({ csrfToken, email, password: pw, callbackUrl: `${BASE}/admin`, json: 'true' })
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body: b }); absorb(r)
  return Object.keys(jar).some(k => k.includes('session-token'))
}
async function adminApi(m: string, p: string, body?: any) {
  const r = await fetch(BASE + p, { method: m, headers: { Cookie: cookie(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let j: any = null; try { j = await r.json() } catch {}; return { status: r.status, json: j }
}

async function main() {
  const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
  if (!files.length) { console.error('sem imagens em', DIR); process.exit(2) }

  const now = new Date()
  let ev = await prisma.event.findFirst({ where: { slug: 'bancada-fase1' } })
  if (!ev) ev = await prisma.event.create({ data: { name: 'BANCADA — Fase 1', slug: 'bancada-fase1', code: 'BANCADA-FASE1', startDate: now, endDate: new Date(now.getTime() + 365 * 86400000) } })
  const email = `probe-${Date.now()}@local`, pw = 'Probe#' + Math.random().toString(36).slice(2)
  const admin = await prisma.eventAdmin.create({ data: { name: 'Probe Admin', email, password: await bcrypt.hash(pw, 10), role: 'SUPER_ADMIN', isActive: true } })

  let tokenId = ''
  const results: { img: string; veredito: string; detalhe: string }[] = []
  let client!: HikvisionClient
  try {
    if (!(await login(email, pw))) throw new Error('login falhou')
    const list = await adminApi('GET', `/api/admin/terminals?eventId=${ev.id}`)
    const term = list.json?.terminals?.find((t: any) => t.ipAddress === DEVICE_IP)
    if (!term) throw new Error('terminal de bancada não cadastrado — rode o bench-flow addUser uma vez antes')
    const gen = await adminApi('POST', '/api/admin/agent-tokens', { eventId: ev.id, name: 'face-quality-probe' })
    tokenId = gen.json?.id
    const ag = await fetch(`${BASE}/api/agent/terminals`, { headers: { Authorization: `Bearer ${gen.json?.token}` } }).then(r => r.json())
    const t = ag.terminals.find((x: any) => x.id === term.id)
    client = new HikvisionClient({ ipAddress: t.ipAddress, port: t.port, useHttps: t.useHttps, username: t.username, password: t.password })

    for (const f of files) {
      const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(DIR + '/' + f).toString('base64')
      // usuário limpo (sem face) a cada imagem
      try { await client.deleteUser(EMP) } catch {}
      await client.addUser({ employeeNo: EMP, name: 'PROBE', userType: 'normal', valid: { enable: true, beginTime: '2025-01-01T00:00:00', endTime: '2037-12-31T23:59:59' } })
      try {
        const r = await client.uploadFace(EMP, dataUrl)
        const ok = r?.statusCode === 1
        results.push({ img: f, veredito: ok ? 'ACEITA ✓' : 'REJEITA', detalhe: ok ? `numOfFace passou p/ 1` : JSON.stringify(r) })
      } catch (e: any) {
        const ds = e?.deviceStatus
        const det = (ds && typeof ds === 'object') ? `${ds.subStatusCode || ''} / ${ds.errorMsg || ''}` : String(ds || e?.message)
        results.push({ img: f, veredito: 'REJEITA ✗', detalhe: det.slice(0, 70) })
      }
    }
    try { await client.deleteUser(EMP) } catch {}
  } finally {
    if (tokenId) { try { await revokeAgentToken(tokenId) } catch {} }
    await prisma.auditLog.deleteMany({ where: { adminId: admin.id } }).catch(() => {})
    await prisma.eventAdmin.deleteMany({ where: { id: admin.id } }).catch(() => {})
    await prisma.$disconnect()
  }

  console.log('\n=== MAPA EMPÍRICO DO TERMINAL (uploadFace, DS-K1T671M-L V3.2.30) ===')
  for (const r of results) console.log(`${r.veredito.padEnd(10)} | ${r.img.padEnd(34)} | ${r.detalhe}`)
  process.exit(0)
}
main().catch(e => { console.error('ERRO:', e?.message); process.exit(1) })
