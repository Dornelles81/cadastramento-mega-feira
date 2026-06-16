/**
 * Runner de bancada da Fase 1 — exercita o CAMINHO DE PRODUÇÃO inteiro contra o
 * terminal real, uma operação de cada vez:
 *   CRUD admin (senha criptografada) -> token de agente -> GET /api/agent/terminals
 *   (credencial decriptada na nuvem) -> HikvisionClient com essa credencial -> ISAPI.
 *
 * A senha do device entra só por env (DEVICE_PASS) e nunca é impressa; a partir
 * do cadastro vive criptografada em Terminal.passwordEncrypted. O token de
 * agente é criado por run e revogado no fim (não fica token vivo sobrando).
 *
 * Uso: DEVICE_PASS=<senha> node_modules/.bin/tsx scripts/bench-flow.ts <op>
 *   op: addUser | deviceInfo   (mais ops nas próximas etapas)
 * Requer o dev server no ar (http://localhost:3000).
 *
 * Fixtures persistentes (reaproveitados entre runs): evento 'bancada-fase1' e o
 * Terminal do IP. Não imprime segredos.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'fs'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { HikvisionClient } from '../lib/hikvision/client'
import { DigestAuth } from '../lib/hikvision/digest-auth'
import { revokeAgentToken } from '../lib/agent/tokens'
import { generateCardNumber, luhnValid } from '../lib/agent/identity'

function numOfFace(searchResult: any): number | string {
  const u = searchResult?.UserInfoSearch?.UserInfo?.[0]
  return u ? u.numOfFace : '(usuário não encontrado)'
}
function numOfCard(searchResult: any): number | string {
  const u = searchResult?.UserInfoSearch?.UserInfo?.[0]
  return u ? u.numOfCard : '(usuário não encontrado)'
}

const BASE = process.env.AGENT_TEST_BASE || 'http://localhost:3000'
const DEVICE_IP = process.env.DEVICE_IP || '192.168.1.47'
const DEVICE_PASS = process.env.DEVICE_PASS || ''
const op = process.argv[2] || 'addUser'

// cookie jar p/ a sessão admin temporária (prova o CRUD HTTP)
const jar: Record<string, string> = {}
function absorb(res: Response) {
  const sc = (res.headers as any).getSetCookie?.() ?? []
  for (const c of sc) { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1) }
}
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

async function adminLogin(email: string, password: string) {
  const csrf = await fetch(`${BASE}/api/auth/csrf`); absorb(csrf)
  const { csrfToken } = await csrf.json()
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/admin`, json: 'true' })
  const cb = await fetch(`${BASE}/api/auth/callback/credentials`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() }, body })
  absorb(cb)
  return Object.keys(jar).some(k => k.includes('session-token'))
}
async function adminApi(method: string, path: string, body?: any) {
  const res = await fetch(BASE + path, { method, headers: { Cookie: cookie(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let j: any = null; try { j = await res.json() } catch {}
  return { status: res.status, json: j }
}
async function agentGet(path: string, token: string) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } })
  let j: any = null; try { j = await res.json() } catch {}
  return { status: res.status, json: j }
}

async function main() {
  // Teste de vazamento: senha PROPOSITALMENTE errada. Loga o erro como um
  // chamador descuidado faria (cru + serialização total) e verifica que a senha
  // NÃO aparece em lugar nenhum. Não precisa de DEVICE_PASS nem setup.
  if (op === 'leaktest') {
    const WRONG = 'WRONG-PASS-LEAKTEST-XYZ'
    const c = new HikvisionClient({ ipAddress: DEVICE_IP, port: 80, username: 'admin', password: WRONG })
    try {
      await c.getDeviceInfo()
      console.log('inesperado: passou com senha errada?!')
    } catch (err: any) {
      console.error('log cru do erro (console.error(err)):', err)
      const dump = JSON.stringify(err, Object.getOwnPropertyNames(err))
      console.log('\nserialização total do erro:', dump)
      const haystack = String(err?.stack || '') + dump + String(err)
      const leaked = haystack.includes(WRONG)
      console.log(`\n>>> a senha aparece no erro? ${leaked ? 'SIM ✗ (VAZOU)' : 'NÃO ✓ (sanitizado)'}`)
    } finally {
      await prisma.$disconnect()
    }
    return
  }

  // DEVICE_PASS só é necessária no PRIMEIRO cadastro do terminal (ver abaixo);
  // com o terminal já registrado, nenhum run precisa da senha em claro.

  // 1) Fixtures: evento de bancada + admin temporário
  const now = new Date()
  let ev = await prisma.event.findFirst({ where: { slug: 'bancada-fase1' } })
  if (!ev) ev = await prisma.event.create({ data: { name: 'BANCADA — Fase 1 (terminais)', slug: 'bancada-fase1', code: 'BANCADA-FASE1', startDate: now, endDate: new Date(now.getTime() + 365 * 86400000) } })

  const adminEmail = `bench-${Date.now()}@local`
  const adminPass = 'Bench#' + Math.random().toString(36).slice(2)
  const admin = await prisma.eventAdmin.create({ data: { name: 'Bench Admin', email: adminEmail, password: await bcrypt.hash(adminPass, 10), role: 'SUPER_ADMIN', isActive: true } })

  let tokenId = ''
  try {
    if (!(await adminLogin(adminEmail, adminPass))) throw new Error('login admin temporário falhou')

    // 2) CRUD: cria o terminal se faltar (senha entra CRIPTOGRAFADA via endpoint),
    //    ou atualiza a senha se já existir — prova cripto-on-store/update.
    const list = await adminApi('GET', `/api/admin/terminals?eventId=${ev.id}`)
    let term = list.json?.terminals?.find((t: any) => t.ipAddress === DEVICE_IP)
    if (!term) {
      // Só o cadastro inicial precisa da senha em claro (entra criptografada).
      if (!DEVICE_PASS) throw new Error('terminal ainda não cadastrado: forneça DEVICE_PASS só nesta primeira vez')
      const created = await adminApi('POST', '/api/admin/terminals', { name: 'Bancada DS-K1T671M-L', ipAddress: DEVICE_IP, port: 80, useHttps: false, username: 'admin', password: DEVICE_PASS, eventId: ev.id, gate: 'Bancada' })
      term = created.json?.terminal
      console.log(`[crud] terminal criado: ${term.id} (hasPassword=${term.hasPassword})`)
    } else {
      // Já cadastrado: NÃO precisa mais da senha em claro — a credencial vem
      // decriptada do endpoint do agente. Só atualiza se DEVICE_PASS for passado.
      if (DEVICE_PASS) { await adminApi('PUT', `/api/admin/terminals/${term.id}`, { password: DEVICE_PASS }); console.log(`[crud] terminal reutilizado: ${term.id} (senha re-criptografada)`) }
      else console.log(`[crud] terminal reutilizado: ${term.id} (credencial já criptografada no banco; sem senha em claro neste run)`)
    }

    // 3) Token de agente (endpoint real)
    const gen = await adminApi('POST', '/api/admin/agent-tokens', { eventId: ev.id, name: `bench ${op}` })
    tokenId = gen.json?.id
    const token = gen.json?.token
    console.log(`[token] agente gerado: ${tokenId} (escopo evento bancada)`)

    // 4) Caminho do agente: credencial DECRIPTADA na nuvem
    const ag = await agentGet('/api/agent/terminals', token)
    const agTerm = ag.json?.terminals?.find((t: any) => t.id === term.id)
    if (!agTerm) throw new Error('terminal não veio em /api/agent/terminals')
    console.log(`[agent] credencial recebida via nuvem p/ ${agTerm.ipAddress}:${agTerm.port} (user=${agTerm.username}, senha decriptada=${agTerm.password ? 'sim' : 'NÃO'})`)

    const client = new HikvisionClient({ ipAddress: agTerm.ipAddress, port: agTerm.port, useHttps: agTerm.useHttps, username: agTerm.username, password: agTerm.password })

    // 5) Operação no device
    if (op === 'deviceInfo') {
      const info = await client.getDeviceInfo()
      console.log('\n=== RETORNO CRU (deviceInfo) ===\n' + (typeof info === 'string' ? info : JSON.stringify(info, null, 2)))
    } else if (op === 'searchUsers') {
      const EMP = process.env.BENCH_EMP || '99000001'
      const search = await client.searchUsers(EMP)
      console.log(`\n=== RETORNO CRU (searchUsers ${EMP}) ===`)
      console.log(typeof search === 'string' ? search : JSON.stringify(search, null, 2))
    } else if (op === 'caps') {
      // capabilities da face (read-only) via credencial vinda do agente
      const d = new DigestAuth(agTerm.username, agTerm.password)
      const capPaths = (process.env.BENCH_CAPS || '/ISAPI/Intelligent/FDLib/capabilities?format=json,/ISAPI/AccessControl/RemoteControl/door/1/capabilities?format=json,/ISAPI/AccessControl/RemoteControl/door/capabilities?format=json').split(',')
      for (const path of capPaths) {
        console.log(`\n=== GET ${path} ===`)
        try {
          const r = await d.request({ method: 'GET', url: `http://${agTerm.ipAddress}:${agTerm.port}${path}`, headers: { Accept: 'application/json' }, timeout: 8000 })
          console.log(typeof r.data === 'string' ? r.data.slice(0, 1600) : JSON.stringify(r.data).slice(0, 1600))
        } catch (e: any) { console.log('falhou:', e?.response?.status || e?.code || e?.message) }
      }
    } else if (op === 'uploadFace') {
      const EMP = process.env.BENCH_EMP || '99000001'
      const facePath = process.env.BENCH_FACE
      if (!facePath || !fs.existsSync(facePath)) throw new Error(`BENCH_FACE inválido: ${facePath}`)
      const b64 = fs.readFileSync(facePath).toString('base64')
      const dataUrl = `data:image/jpeg;base64,${b64}`
      console.log(`[uploadFace] imagem=${facePath} (${(b64.length / 1024).toFixed(0)} KB base64) -> employeeNo ${EMP}`)

      const before = await client.searchUsers(EMP)
      console.log(`[antes] numOfFace = ${numOfFace(before)}`)

      try {
        const result = await client.uploadFace(EMP, dataUrl)
        console.log('\n=== RETORNO CRU DO DEVICE (uploadFace) ===')
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
      } catch (e: any) {
        console.log('\n=== uploadFace REJEITADO (sanitizado) ===')
        console.log('message:', e?.message, '| device:', JSON.stringify(e?.deviceStatus))
      }

      const after = await client.searchUsers(EMP)
      console.log(`\n[depois] numOfFace = ${numOfFace(after)}`)
    } else if (op === 'addUser') {
      const EMP = process.env.BENCH_EMP || '99000001'
      const payload = { employeeNo: EMP, name: 'BANCADA TESTE', userType: 'normal' as const, valid: { enable: true, beginTime: '2025-01-01T00:00:00', endTime: '2037-12-31T23:59:59' } }
      console.log(`\n[addUser] enviando employeeNo=${EMP}, name="BANCADA TESTE" ...`)
      const result = await client.addUser(payload)
      console.log('\n=== RETORNO CRU DO DEVICE (addUser) ===')
      console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
      // leitura de confirmação (read-only)
      const search = await client.searchUsers(EMP)
      console.log('\n=== CONFIRMAÇÃO (searchUsers) ===')
      console.log(typeof search === 'string' ? search : JSON.stringify(search, null, 2))
    } else if (op === 'registerCard') {
      const EMP = process.env.BENCH_EMP || '99000001'
      const card = process.env.BENCH_CARD || generateCardNumber()
      console.log(`[registerCard] cardNo=${card} (16 díg, Luhn válido=${luhnValid(card)}) -> employeeNo ${EMP}`)
      const before = await client.searchUsers(EMP)
      console.log(`[antes] numOfCard = ${numOfCard(before)}`)
      try {
        const result = await client.registerCard(EMP, card)
        console.log('\n=== RETORNO CRU DO DEVICE (registerCard) ===')
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
      } catch (e: any) {
        console.log('\n=== registerCard REJEITADO (sanitizado) ===')
        console.log('message:', e?.message, '| device:', JSON.stringify(e?.deviceStatus))
      }
      const after = await client.searchUsers(EMP)
      console.log(`\n[depois] numOfCard = ${numOfCard(after)}`)
    } else if (op === 'deleteUser') {
      const EMP = process.env.BENCH_EMP || '99000001'
      // busca de card por employeeNo (CardInfo/Search) via credencial do agente
      const d = new DigestAuth(agTerm.username, agTerm.password)
      const cardMatches = async (emp: string) => {
        const r = await d.request({
          method: 'POST',
          url: `http://${agTerm.ipAddress}:${agTerm.port}/ISAPI/AccessControl/CardInfo/Search?format=json`,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          data: { CardInfoSearchCond: { searchID: '1', maxResults: 30, searchResultPosition: 0, EmployeeNoList: [{ employeeNo: emp }] } },
          timeout: 8000
        })
        return r.data?.CardInfoSearch?.numOfMatches
      }

      console.log(`\n[deleteUser] removendo employeeNo=${EMP} ...`)
      const uBefore = await client.searchUsers(EMP)
      const cBefore = await cardMatches(EMP)
      console.log(`[antes] usuário numOfMatches=${uBefore?.UserInfoSearch?.numOfMatches} | numOfFace=${numOfFace(uBefore)} | numOfCard=${numOfCard(uBefore)} | CardInfo/Search numOfMatches=${cBefore}`)

      const result = await client.deleteUser(EMP)
      console.log('\n=== RETORNO CRU DO DEVICE (deleteUser) ===')
      console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))

      const uAfter = await client.searchUsers(EMP)
      const cAfter = await cardMatches(EMP)
      console.log(`\n[depois] usuário numOfMatches=${uAfter?.UserInfoSearch?.numOfMatches} (0=removido) | CardInfo/Search numOfMatches=${cAfter} (0=card também removido)`)
      const limpo = (uAfter?.UserInfoSearch?.numOfMatches === 0) && (cAfter === 0)
      console.log(`>>> remoção COMPLETA (nem face nem card restam): ${limpo ? 'SIM ✓' : 'NÃO ✗'}`)
    } else if (op === 'openDoor') {
      const doorNo = Number(process.env.BENCH_DOOR || '1')
      console.log(`[openDoor] disparando pulso na porta doorNo=${doorNo} (device tem 1 porta / electroLockNum=1) ...`)
      try {
        const result = await client.openDoor(doorNo)
        console.log('\n=== RETORNO CRU DO DEVICE (openDoor) ===')
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
        console.log(`\n>>> comando enviado para doorNo=${doorNo}. CONFIRMAÇÃO FÍSICA (relé/LED) é no terminal de bancada.`)
      } catch (e: any) {
        console.log('\n=== openDoor REJEITADO (sanitizado) ===')
        console.log('message:', e?.message, '| device:', JSON.stringify(e?.deviceStatus))
      }
    } else {
      console.log(`op desconhecida: ${op}`)
    }
  } catch (deviceErr: any) {
    // catch específico do device: imprime só o erro sanitizado (sem credencial)
    console.error('\n=== ERRO DO DEVICE (sanitizado) ===')
    console.error('message:', deviceErr?.message)
    console.error('status:', deviceErr?.status, '| device:', JSON.stringify(deviceErr?.deviceStatus))
  } finally {
    // hygiene: revoga o token do run e remove o admin temporário; mantém evento+terminal
    if (tokenId) { try { await revokeAgentToken(tokenId) } catch {} }
    await prisma.auditLog.deleteMany({ where: { adminId: admin.id } }).catch(() => {})
    await prisma.eventAdmin.deleteMany({ where: { id: admin.id } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error('ERRO (setup):', e?.message); process.exit(1) })
