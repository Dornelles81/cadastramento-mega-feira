/**
 * Teste das MINIATURAS sob demanda e da lista sem foto (fatura do Neon, set/2026).
 *
 * Cobre:
 *   1) lib/face/thumbnail: 96×96 WebP, pequeno, a partir de uma foto grande
 *   2) /api/admin/eventos/[slug]/miniaturas
 *      - 401 sem sessão, 403 para OPERATOR e para admin sem canView no evento
 *      - devolve miniatura só de quem é do evento e tem foto
 *      - removido, expurgado e id de OUTRO evento não aparecem em lista nenhuma
 *      - foto ilegível vira "sem foto", sem 500 no lote
 *      - limites de entrada (sem ids, mais de 40, id malformado)
 *      - Cache-Control private, no-store
 *   3) /api/admin/participants-full e lerParticipanteParaAdmin: NENHUMA foto no
 *      JSON, e `temFoto` certo para cada caso
 *
 * As fotos são imagens SINTÉTICAS geradas aqui — nenhum rosto real.
 * Requer o dev server no ar apontado para o banco de teste:
 *   .\scripts\testar.ps1 -Comando 'npm run dev'      (numa janela)
 *   .\scripts\testar.ps1 scripts\test-miniaturas.ts  (noutra)
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-miniaturas.ts')

import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { miniaturaDeDataUrl, MINIATURA_PX } from '../lib/face/thumbnail'
import { lerParticipanteParaAdmin } from '../lib/participants/admin-view'

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const SUF = Date.now().toString().slice(-6)
const SENHA = `Mini-${SUF}-${Math.random().toString(36).slice(2)}`

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

/** Foto sintética "de celular": 720×960 JPEG com gradiente e ruído. */
async function fotoSintetica(cor: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#222"/></linearGradient></defs>
    <rect width="720" height="960" fill="url(#g)"/><circle cx="360" cy="420" r="220" fill="#e8c4a0"/>
    <text x="360" y="880" font-size="60" text-anchor="middle" fill="#fff">TESTE ${SUF}</text></svg>`
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

function cliente() {
  const jar: Record<string, string> = {}
  const absorb = (res: Response) => {
    for (const c of (res.headers as any).getSetCookie?.() ?? []) {
      const kv = c.split(';')[0]
      const i = kv.indexOf('=')
      if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1)
    }
  }
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async login(email: string) {
      const r = await fetch(`${BASE}/api/auth/csrf`)
      absorb(r)
      const { csrfToken } = await r.json()
      const cb = await fetch(`${BASE}/api/auth/callback/credentials`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
        body: new URLSearchParams({ csrfToken, email, password: SENHA, callbackUrl: `${BASE}/admin`, json: 'true' })
      })
      absorb(cb)
      return Object.keys(jar).some((k) => k.includes('session-token'))
    },
    async get(path: string) {
      const res = await fetch(BASE + path, { headers: { Cookie: cookie() } })
      let json: any = null
      try { json = await res.json() } catch {}
      return { status: res.status, json, headers: res.headers }
    }
  }
}

async function main() {
  const c = { events: [] as string[], admins: [] as string[], participants: [] as string[] }
  try {
    console.log('\n=== 1) miniatura a partir de foto grande ===')
    const foto = await fotoSintetica('#3366cc')
    const cheiaBytes = Buffer.from(foto.split(',')[1], 'base64').length
    const mini = await miniaturaDeDataUrl(foto)
    const miniBuf = Buffer.from((mini ?? '').split(',')[1] ?? '', 'base64')
    const meta = mini ? await sharp(miniBuf).metadata() : null
    check('gera data URL WebP', !!mini && mini.startsWith('data:image/webp;base64,'))
    check(`${MINIATURA_PX}×${MINIATURA_PX}`, meta?.width === MINIATURA_PX && meta?.height === MINIATURA_PX, { w: meta?.width, h: meta?.height })
    check('menos de 8 KB', miniBuf.length < 8192, { miniatura: miniBuf.length, cheia: cheiaBytes })
    check('URL http legada não é baixada (null)', (await miniaturaDeDataUrl('https://exemplo.test/f.jpg')) === null)

    console.log('\n=== fixtures ===')
    const now = new Date()
    const mkEv = (n: string) => prisma.event.create({ data: { name: `MINI ${n} ${SUF}`, slug: `mini-${n}-${SUF}`, code: `MINI-${n}-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000) } })
    const evA = await mkEv('a'); c.events.push(evA.id)
    const evB = await mkEv('b'); c.events.push(evB.id)
    const cifrada = encryptString(foto)
    const corrompida = Buffer.from(cifrada); corrompida[corrompida.length - 1] ^= 0xff
    let n = 0
    const mkP = async (eventId: string, extra: any) => {
      const p = await prisma.participant.create({ data: { eventId, name: `Mini Teste ${n}`, cpf: `8${SUF}${String(n++).padStart(4, '0')}`.slice(-11), status: 'active', isDeleted: false, approvalStatus: 'approved', ...extra } })
      c.participants.push(p.id)
      return p
    }
    const pFoto = await mkP(evA.id, { faceData: cifrada })
    const pSem = await mkP(evA.id, {})
    const pRemovido = await mkP(evA.id, { faceData: cifrada, status: 'removed' }) // linha "antiga" que ainda tem bytes
    const pApagado = await mkP(evA.id, { faceData: cifrada, isDeleted: true })
    const pCorrompida = await mkP(evA.id, { faceData: corrompida })
    const pOutroEvento = await mkP(evB.id, { faceData: cifrada })

    const hash = await bcrypt.hash(SENHA, 10)
    const mkAdmin = async (tag: string, role: string, acesso?: { eventId: string; canView: boolean }) => {
      const a = await prisma.eventAdmin.create({ data: { name: `Mini ${tag}`, email: `mini-${tag}-${SUF}@teste.local`, password: hash, role, isActive: true } })
      c.admins.push(a.id)
      if (acesso) await prisma.eventAdminAccess.create({ data: { adminId: a.id, eventId: acesso.eventId, canView: acesso.canView } })
      return a
    }
    const adminA = await mkAdmin('a', 'ADMIN', { eventId: evA.id, canView: true })
    const adminSemView = await mkAdmin('sv', 'ADMIN', { eventId: evA.id, canView: false })
    const operador = await mkAdmin('op', 'OPERATOR', { eventId: evA.id, canView: true })

    const ids = [pFoto, pSem, pRemovido, pApagado, pCorrompida, pOutroEvento].map((p) => p.id)
    const rota = (slug: string, lista: string[]) => `/api/admin/eventos/${slug}/miniaturas?ids=${lista.join(',')}`

    console.log('\n=== 2) autorização ===')
    const anon = cliente()
    check('sem sessão → 401', (await anon.get(rota(evA.slug, ids))).status === 401)
    const op = cliente()
    check('login OPERATOR', await op.login(operador.email))
    check('OPERATOR → 403', (await op.get(rota(evA.slug, ids))).status === 403)
    const sv = cliente()
    check('login admin sem canView', await sv.login(adminSemView.email))
    check('admin sem canView → 403', (await sv.get(rota(evA.slug, ids))).status === 403)
    const a = cliente()
    check('login admin do evento A', await a.login(adminA.email))
    check('admin do A no evento B → 403', (await a.get(rota(evB.slug, [pOutroEvento.id]))).status === 403)

    console.log('\n=== 3) conteúdo ===')
    const r = await a.get(rota(evA.slug, ids))
    const mins = r.json?.miniaturas ?? {}
    const sem: string[] = r.json?.semFoto ?? []
    check('200', r.status === 200, r.status)
    check('Cache-Control private, no-store', r.headers.get('cache-control') === 'private, no-store', r.headers.get('cache-control'))
    check('com foto → miniatura WebP', typeof mins[pFoto.id] === 'string' && mins[pFoto.id].startsWith('data:image/webp;base64,'))
    check('sem foto → semFoto', sem.includes(pSem.id) && !mins[pSem.id])
    check('foto ilegível → semFoto, sem 500', sem.includes(pCorrompida.id) && !mins[pCorrompida.id])
    const fora = (id: string) => !mins[id] && !sem.includes(id)
    check('removido não aparece em lista nenhuma', fora(pRemovido.id))
    check('expurgado não aparece em lista nenhuma', fora(pApagado.id))
    check('id de OUTRO evento não aparece em lista nenhuma', fora(pOutroEvento.id))
    check('só uma miniatura no lote', Object.keys(mins).length === 1, Object.keys(mins).length)

    console.log('\n=== 4) limites de entrada ===')
    check('sem ids → 400', (await a.get(`/api/admin/eventos/${evA.slug}/miniaturas`)).status === 400)
    const muitos = Array.from({ length: 41 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    check('41 ids → 400', (await a.get(rota(evA.slug, muitos))).status === 400)
    const lixo = await a.get(`/api/admin/eventos/${evA.slug}/miniaturas?ids=${encodeURIComponent("x' OR 1=1--")},${pFoto.id}`)
    check('id malformado é descartado, o válido é atendido', lixo.status === 200 && !!lixo.json?.miniaturas?.[pFoto.id])
    check('slug inexistente → 404', (await a.get(rota(`nao-existe-${SUF}`, [pFoto.id]))).status === 404)

    console.log('\n=== 5) lista sem foto nenhuma ===')
    const lista = await a.get(`/api/admin/participants-full?eventId=${evA.id}&includeRemoved=1`)
    const ps: any[] = lista.json?.participants ?? []
    check('participants-full 200', lista.status === 200, lista.status)
    const bruto = JSON.stringify(lista.json ?? {})
    check('nenhum data URL de imagem no JSON', !/data:image\//.test(bruto))
    check('nenhuma chave faceData/faceImageUrl', ps.every((p) => !('faceData' in p) && !('faceImageUrl' in p)))
    const porId = new Map(ps.map((p) => [p.id, p]))
    check('temFoto: com foto = true', porId.get(pFoto.id)?.temFoto === true)
    check('temFoto: sem foto = false', porId.get(pSem.id)?.temFoto === false)
    check('temFoto: ilegível = true (existe; o /work acusa)', porId.get(pCorrompida.id)?.temFoto === true)
    check('temFoto: removido = false', porId.get(pRemovido.id)?.temFoto === false)
    check('JSON pequeno (< 20 KB para 5 pessoas)', bruto.length < 20000, bruto.length)
    const um = await lerParticipanteParaAdmin(pFoto.id)
    check('formato do PUT: sem foto no objeto, temFoto=true', !!um && !('faceImageUrl' in um) && um.temFoto === true)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.eventAdminAccess.deleteMany({ where: { adminId: { in: c.admins } } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { adminId: { in: c.admins } } }).catch(() => {})
    await prisma.eventAdmin.deleteMany({ where: { id: { in: c.admins } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: c.participants } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: c.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
