/**
 * sync-faces-device.ts — Sync facial → terminal Hikvision (DS-K1T671M-L)
 * RUNNER DE TESTE CONTROLADO. Não é o push automático da Fase 2.
 *
 * Fala DIRETO com o terminal por ISAPI, pelo mesmo `HikvisionClient` do caminho
 * de produção (Digest-first, `uploadFace` multipart), logando cada degrau
 * separadamente para que uma falha diga EM QUAL etapa e com QUAL resposta do
 * device ela aconteceu.
 *
 * SEGURANÇA (o que este script se recusa a fazer):
 *   - Sem flag, não faz NADA além de imprimir esta ajuda.
 *   - Sync em massa só com `--all` explícito.
 *   - NUNCA envia participante removido/excluído (ver lib/hikvision/sync-targets).
 *   - `--dry-run` não abre conexão com o terminal.
 *   - Não escreve nada no banco: é ferramenta de leitura + envio ao device.
 *     O estado de sync (ParticipantTerminalSync) é da Fase 2.
 *
 * Uso:
 *   tsx scripts/sync-faces-device.ts --help
 *   tsx scripts/sync-faces-device.ts --participant=<id|employeeNo> --dry-run
 *   tsx scripts/sync-faces-device.ts --participant=<id|employeeNo>
 *   tsx scripts/sync-faces-device.ts --all --dry-run
 *   tsx scripts/sync-faces-device.ts --all --limit=5
 *
 * Ambiente (.env.local):
 *   DEVICE_IP        IP do terminal (ex.: 192.168.1.30)          [ou --ip=]
 *   DEVICE_PORT      porta ISAPI (default 80)
 *   DEVICE_USE_HTTPS "true" para HTTPS
 *   DEVICE_PASS      senha — SÓ se o terminal não estiver cadastrado na tabela
 *                    Terminal; com ele cadastrado, a senha vem criptografada do
 *                    banco e nenhuma senha em claro é necessária.
 *   MASTER_KEY       obrigatória: decripta faceData (AES-256-GCM) e a senha.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Imports após o dotenv: lib/crypto valida MASTER_KEY em tempo de uso.
import * as fs from 'fs'
import axios from 'axios'
import { prisma } from '../lib/prisma'
import { decryptToString } from '../lib/crypto'
import { getFaceImageDataUrl } from '../lib/face-image'
import { HikvisionClient, type HikvisionObservation } from '../lib/hikvision/client'
import { fetchSyncTarget, fetchSyncTargets, type SyncTarget } from '../lib/hikvision/sync-targets'
import { assertFaceCryptoReady } from '../lib/crypto-preflight'

// ── INVARIANTES (não alterar sem decisão explícita) ──────────
// employeeNo: id sequencial imutável do participante — é também o FPID da face.
const VALID_BEGIN = '2025-01-01T00:00:00'
const VALID_END   = '2037-12-31T23:59:59'  // fim de validade fixo no device
// FDID vem do cadastro do Terminal (coluna fdid), não mais de env solto.
const FACE_DUMP_DIR = path.resolve(process.cwd(), 'tmp-faces') // gitignored

// ── Flags ────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}
const HELP        = flag('help') !== undefined || argv.length === 0
const ALL         = flag('all') !== undefined
const PARTICIPANT = flag('participant')
const DRY_RUN     = flag('dry-run') !== undefined
const IP_ARG      = flag('ip')
const LIMIT       = flag('limit') ? Number(flag('limit')) : undefined

// ── Relatório ────────────────────────────────────────────────
type FailureKind =
  | 'sem-foto'
  | 'falha-decriptacao'
  | 'foto-invalida'
  | 'device-criar-usuario'
  | 'device-subir-face'
  | 'device-verificar'
  | 'nao-confirmado'
  | 'erro-inesperado'

interface Failure { name: string; employeeNo: string; kind: FailureKind; detail: string }

const report = {
  processed: 0,
  ok: 0,
  failures: [] as Failure[]
}

function fail(t: SyncTarget, kind: FailureKind, detail: string): void {
  report.failures.push({ name: t.name, employeeNo: t.employeeNo, kind, detail })
}

// ── Ajuda ────────────────────────────────────────────────────
function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Sync facial → terminal Hikvision — RUNNER DE TESTE          ║
╚══════════════════════════════════════════════════════════════╝

Sem flag este script NÃO FAZ NADA. Sync em massa exige --all explícito.

  --help                      esta ajuda
  --participant=<id|empNo>    processa EXATAMENTE um participante
  --all                       processa todos os elegíveis (use com --dry-run 1º)
  --dry-run                   valida a foto e salva em ./tmp-faces/ SEM tocar
                              no terminal (nenhuma conexão é aberta)
  --limit=<n>                 (com --all) processa no máximo n participantes
  --ip=<ip>                   IP do terminal (default: env DEVICE_IP)

Nunca sincroniza participante removido (status != 'active' ou isDeleted),
nem no modo --all nem quando pedido pelo id. Não escreve no banco.

Roteiro sugerido de bancada:
  1) tsx scripts/sync-faces-device.ts --participant=<empNo> --dry-run
     → confere o JPEG em ./tmp-faces/<empNo>.jpg a olho
  2) tsx scripts/sync-faces-device.ts --participant=<empNo>
     → 3 degraus no device, um a um
  3) tsx scripts/sync-faces-device.ts --all --dry-run
  4) tsx scripts/sync-faces-device.ts --all

./tmp-faces/ contém BIOMETRIA EM CLARO: está no .gitignore; apague após o teste.
`)
}

// ── Validação de JPEG ────────────────────────────────────────
const SOF_MARKERS = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF])

interface JpegInfo { width: number; height: number; bytes: number; eoi: boolean }
type JpegCheck = { ok: true; info: JpegInfo } | { ok: false; error: string }

/**
 * Valida que o buffer é um JPEG íntegro de verdade: SOI, cadeia de marcadores
 * navegável, SOF com dimensões e EOI no fim (arquivo não truncado).
 */
function inspectJpeg(buf: Buffer): JpegCheck {
  if (buf.length < 100) return { ok: false, error: `buffer curto demais (${buf.length} bytes)` }

  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { ok: false, error: 'a imagem é PNG, não JPEG — o terminal espera JPEG' }
  }
  if (!(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)) {
    const head = buf.subarray(0, 4).toString('hex').toUpperCase()
    return { ok: false, error: `magic bytes inválidos (esperado FFD8FF, veio ${head})` }
  }

  let width = 0
  let height = 0
  let i = 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) return { ok: false, error: `cadeia de marcadores corrompida no offset ${i}` }
    let marker = buf[i + 1]
    while (marker === 0xFF && i + 2 < buf.length) { i++; marker = buf[i + 1] } // fill bytes

    if (marker === 0xD9) break                                  // EOI
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) { i += 2; continue } // sem payload

    const segLen = buf.readUInt16BE(i + 2)
    if (segLen < 2 || i + 2 + segLen > buf.length) {
      return { ok: false, error: `segmento inválido no offset ${i} (len=${segLen}) — arquivo truncado?` }
    }
    if (SOF_MARKERS.has(marker)) {
      height = buf.readUInt16BE(i + 5)
      width = buf.readUInt16BE(i + 7)
      break
    }
    if (marker === 0xDA) break // início do scan: não há mais SOF depois
    i += 2 + segLen
  }

  if (!width || !height) return { ok: false, error: 'não foi possível ler as dimensões (SOF ausente)' }
  if (width > 10000 || height > 10000) return { ok: false, error: `dimensões absurdas (${width}x${height})` }

  // EOI no fim (ignorando padding de zeros que alguns encoders deixam)
  let end = buf.length - 1
  while (end > 1 && buf[end] === 0x00) end--
  const eoi = buf[end - 1] === 0xFF && buf[end] === 0xD9

  return { ok: true, info: { width, height, bytes: buf.length, eoi } }
}

// ── Foto do participante ─────────────────────────────────────
type FaceResult =
  | { ok: true; bytes: Buffer; dataUrl: string }
  | { ok: false; kind: 'sem-foto' | 'falha-decriptacao'; error: string }

/**
 * Descriptografa (AES-256-GCM) e extrai os bytes da imagem.
 *
 * Separa os dois casos que antes eram um só: NÃO TER foto (legítimo) e ter
 * biometria que não abre (falha de chave/corrupção). Confundi-los era o
 * silêncio que fazia um sync inteiro parecer "ninguém tem foto".
 */
function loadFaceBytes(t: SyncTarget): FaceResult {
  let dataUrl: string | null
  try {
    dataUrl = getFaceImageDataUrl(t)
  } catch (e: any) {
    return { ok: false, kind: 'falha-decriptacao', error: e?.message ?? String(e) }
  }
  if (!dataUrl) return { ok: false, kind: 'sem-foto', error: 'participante não possui foto armazenada' }
  if (/^https?:\/\//.test(dataUrl)) return { ok: false, kind: 'sem-foto', error: 'foto é URL externa — não suportada neste runner' }

  const comma = dataUrl.indexOf(',')
  if (comma === -1) return { ok: false, kind: 'sem-foto', error: 'data URL malformado (sem vírgula)' }

  const bytes = Buffer.from(dataUrl.slice(comma + 1), 'base64')
  return { ok: true, bytes, dataUrl }
}

// ── Log dos degraus ──────────────────────────────────────────
function logObs(step: string, obs: HikvisionObservation | null): void {
  if (!obs) {
    console.log(`      ${step} sem resposta observada`)
    return
  }
  const http = obs.status !== undefined ? `HTTP ${obs.status}` : `sem HTTP (${obs.code ?? 'erro de rede'})`
  const body = typeof obs.body === 'string' ? obs.body.slice(0, 400) : JSON.stringify(obs.body ?? null)
  console.log(`      ${step} ${http} [auth=${obs.scheme}]`)
  console.log(`      corpo: ${body}`)
}

// ── Auth: o que o device exige ───────────────────────────────
/**
 * Pergunta ao device, sem credencial, qual esquema ele anuncia no
 * WWW-Authenticate. É a negociação real — o client usa Digest-first, e isto
 * confirma se o device concorda.
 */
async function probeAuthScheme(baseUrl: string): Promise<string> {
  try {
    const res = await axios.get(`${baseUrl}/ISAPI/System/deviceInfo`, {
      timeout: 8000,
      validateStatus: () => true
    })
    if (res.status !== 401) return `sem desafio (HTTP ${res.status}) — device não pediu autenticação`
    const header = String(res.headers['www-authenticate'] ?? '')
    if (!header) return 'HTTP 401 sem cabeçalho WWW-Authenticate'
    const scheme = header.split(' ')[0]
    const realm = /realm="([^"]*)"/.exec(header)?.[1]
    const qop = /qop="?([^",]*)"?/.exec(header)?.[1]
    return `${scheme}${realm ? ` realm="${realm}"` : ''}${qop ? ` qop=${qop}` : ''}`
  } catch (e: any) {
    return `não foi possível sondar (${e?.code ?? e?.message})`
  }
}

// ── Terminal (equipamento) ───────────────────────────────────
interface TerminalRow {
  id: string; name: string; ipAddress: string; port: number; useHttps: boolean
  username: string; passwordEncrypted: Buffer | null; fdid: string
  deviceModel: string | null; firmwareVersion: string | null
}

/**
 * Resolve o EQUIPAMENTO no banco pelo IP. Não toca a rede.
 *
 * O cadastro é obrigatório mesmo no --dry-run: sem a linha `Terminal` não há
 * alocação, e sem alocação não há escopo de evento — o sync não teria como
 * saber quais participantes lhe pertencem.
 */
async function resolveTerminal(): Promise<TerminalRow> {
  const ip = IP_ARG || process.env.DEVICE_IP || process.env.HIKVISION_DEVICE_IP
  if (!ip) {
    throw new Error('IP do terminal não definido. Use --ip=<ip> ou DEVICE_IP no .env.local')
  }

  const terminal = await prisma.terminal.findFirst({
    where: { ipAddress: ip, isActive: true },
    select: {
      id: true, name: true, ipAddress: true, port: true, useHttps: true,
      username: true, passwordEncrypted: true, fdid: true,
      deviceModel: true, firmwareVersion: true
    }
  })
  if (!terminal) {
    throw new Error(
      `Terminal ${ip} não está cadastrado (ou está inativo). Cadastre-o antes: ` +
      `DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts`
    )
  }

  const modelo = [terminal.deviceModel, terminal.firmwareVersion].filter(Boolean).join(' ') || 'modelo não registrado'
  console.log(`🖥️  Terminal: "${terminal.name}" — ${terminal.ipAddress}:${terminal.port} (${modelo}, FDID ${terminal.fdid})`)
  return { ...terminal, passwordEncrypted: terminal.passwordEncrypted ? Buffer.from(terminal.passwordEncrypted) : null }
}

// ── Conexão com o terminal ───────────────────────────────────
interface DeviceConn { client: HikvisionClient; baseUrl: string; fdid: string; lastObs: () => HikvisionObservation | null }

async function connectDevice(terminal: TerminalRow): Promise<DeviceConn> {
  // Credencial: preferir a do banco (criptografada). Senha em claro no env é
  // só o caminho de emergência para terminal recém-cadastrado.
  let username = terminal.username
  let password = ''
  let origem = ''

  if (terminal.passwordEncrypted) {
    password = decryptToString(terminal.passwordEncrypted)
    origem = `tabela Terminal (senha decriptada localmente)`
  } else if (process.env.DEVICE_PASS) {
    password = process.env.DEVICE_PASS
    username = process.env.HIKVISION_USER ?? username
    origem = 'env DEVICE_PASS'
  }
  if (!password) {
    throw new Error(`Sem credencial para ${terminal.ipAddress}: Terminal.passwordEncrypted vazio e DEVICE_PASS não definida.`)
  }

  let last: HikvisionObservation | null = null
  const client = new HikvisionClient({
    ipAddress: terminal.ipAddress,
    port: terminal.port,
    useHttps: terminal.useHttps,
    username,
    password,
    observer: obs => { last = obs }
  })

  const baseUrl = `${terminal.useHttps ? 'https' : 'http'}://${terminal.ipAddress}:${terminal.port}`
  console.log(`🔑 Credencial: usuário "${username}" — origem: ${origem}`)
  console.log(`🔐 Auth exigida pelo device: ${await probeAuthScheme(baseUrl)}`)
  console.log(`   Client: Digest-first (Basic só se não houver credencial utilizável)\n`)

  return { client, baseUrl, fdid: terminal.fdid, lastObs: () => last }
}

// ── Processamento ────────────────────────────────────────────

/** Modo --dry-run: valida a foto e salva para inspeção. Não toca no device. */
function processDry(t: SyncTarget, idx: string): void {
  console.log(`${idx} ${t.name} — employeeNo ${t.employeeNo}`)

  const face = loadFaceBytes(t)
  if (!face.ok) {
    console.log(`      ❌ ${face.error}`)
    fail(t, face.kind, face.error)
    return
  }
  console.log(`      [1] faceData descriptografado (AES-256-GCM) → ${face.bytes.length} bytes`)

  const check = inspectJpeg(face.bytes)
  if (!check.ok) {
    console.log(`      ❌ [2] JPEG inválido: ${check.error}`)
    fail(t, 'foto-invalida', check.error)
    return
  }
  const { width, height, bytes, eoi } = check.info
  console.log(`      [2] JPEG íntegro: ${width}x${height}, ${(bytes / 1024).toFixed(1)} KB, EOI=${eoi ? 'ok' : 'AUSENTE'}`)
  if (!eoi) console.log('          ⚠️  sem marcador de fim: imagem possivelmente truncada')
  if (width < 200 || height < 200) console.log(`          ⚠️  resolução baixa (${width}x${height}) para reconhecimento facial`)

  fs.mkdirSync(FACE_DUMP_DIR, { recursive: true })
  const out = path.join(FACE_DUMP_DIR, `${t.employeeNo}.jpg`)
  fs.writeFileSync(out, face.bytes)
  console.log(`      [3] salvo em ./tmp-faces/${t.employeeNo}.jpg (inspecione a olho)`)
  console.log('      ✅ dry-run OK — nada foi enviado ao terminal')
  report.ok++
}

/** Modo real: os 3 degraus no device, logados um a um. */
async function processLive(conn: DeviceConn, t: SyncTarget, idx: string): Promise<void> {
  console.log(`${idx} ${t.name} — employeeNo ${t.employeeNo}`)

  const face = loadFaceBytes(t)
  if (!face.ok) {
    console.log(`      ❌ ${face.error}`)
    fail(t, face.kind, face.error)
    return
  }
  const check = inspectJpeg(face.bytes)
  if (!check.ok) {
    console.log(`      ❌ JPEG inválido: ${check.error}`)
    fail(t, 'foto-invalida', check.error)
    return
  }
  console.log(`      foto: ${check.info.width}x${check.info.height}, ${(check.info.bytes / 1024).toFixed(1)} KB`)

  // [1] criar usuário — UserInfo/Record (com doorRight + RightPlan + endTime 2037)
  console.log(`      [1] criar usuário  UserInfo/Record  employeeNo=${t.employeeNo}`)
  try {
    await conn.client.addUser({
      employeeNo: t.employeeNo,
      name: t.name,
      userType: 'normal',
      valid: { enable: true, beginTime: VALID_BEGIN, endTime: VALID_END }
    })
    logObs('→', conn.lastObs())
  } catch (e: any) {
    logObs('→', conn.lastObs())
    console.log(`      ❌ falhou no degrau [1] criar usuário`)
    fail(t, 'device-criar-usuario', `${e?.message} | device: ${JSON.stringify(e?.deviceStatus ?? null)}`)
    return
  }

  // [2] subir face — FDLib (multipart; o firmware rejeita base64-em-JSON)
  console.log(`      [2] subir face     FDLib/FaceDataRecord  FDID=${conn.fdid} FPID=${t.employeeNo}`)
  try {
    await conn.client.uploadFace(t.employeeNo, face.dataUrl, conn.fdid)
    logObs('→', conn.lastObs())
  } catch (e: any) {
    logObs('→', conn.lastObs())
    console.log(`      ❌ falhou no degrau [2] subir face`)
    fail(t, 'device-subir-face', `${e?.message} | device: ${JSON.stringify(e?.deviceStatus ?? null)}`)
    return
  }

  // [3] verificar — usuário + face na biblioteca, pelo FPID
  console.log(`      [3] verificar      UserInfo/Search + FDLib/FDSearch  FPID=${t.employeeNo}`)
  let numOfFace: number | undefined
  try {
    const users = await conn.client.searchUsers(t.employeeNo)
    logObs('→', conn.lastObs())
    numOfFace = users?.UserInfoSearch?.UserInfo?.[0]?.numOfFace
  } catch (e: any) {
    logObs('→', conn.lastObs())
    console.log(`      ❌ falhou no degrau [3] verificar (UserInfo/Search)`)
    fail(t, 'device-verificar', `${e?.message} | device: ${JSON.stringify(e?.deviceStatus ?? null)}`)
    return
  }

  // FDSearch é confirmação extra do lado da FDLib: se o firmware não suportar,
  // não invalida o envio — só é reportado.
  let fdMatches: number | string = 'n/d'
  try {
    const fd = await conn.client.searchFace(t.employeeNo, conn.fdid)
    logObs('→', conn.lastObs())
    fdMatches = fd?.numOfMatches ?? fd?.MatchList?.length ?? 'n/d'
  } catch (e: any) {
    logObs('→', conn.lastObs())
    console.log(`      ⚠️  FDSearch não respondeu (${e?.message}) — seguindo pelo numOfFace`)
  }

  const encontrado = (numOfFace ?? 0) >= 1
  console.log(`      resultado: usuário ${numOfFace === undefined ? 'NÃO ENCONTRADO' : 'encontrado'}, numOfFace=${numOfFace ?? 0}, FDSearch numOfMatches=${fdMatches}`)

  if (!encontrado) {
    console.log('      ❌ device aceitou os envios mas não confirma a face')
    fail(t, 'nao-confirmado', `numOfFace=${numOfFace ?? 0}, FDSearch=${fdMatches}`)
    return
  }

  console.log('      ✅ sincronizado e confirmado no terminal')
  report.ok++
}

// ── Relatório final ──────────────────────────────────────────
function printReport(): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Relatório final                                             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`  Total processado : ${report.processed}`)
  console.log(`  ✅ Sucessos       : ${report.ok}`)
  console.log(`  ❌ Falhas         : ${report.failures.length}`)

  if (report.failures.length === 0) return

  const groups = new Map<FailureKind, Failure[]>()
  for (const f of report.failures) {
    const list = groups.get(f.kind) ?? []
    list.push(f)
    groups.set(f.kind, list)
  }

  console.log('\n  Falhas agrupadas por tipo de erro:')
  for (const [kind, list] of Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ▸ ${kind} — ${list.length} ocorrência(s)`)
    for (const f of list) {
      console.log(`      • ${f.name} (employeeNo ${f.employeeNo})`)
      console.log(`        ${f.detail}`)
    }
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  // TRAVA: sem flag de modo, não faz nada.
  if (HELP || (!ALL && PARTICIPANT === undefined)) {
    printHelp()
    return
  }
  if (ALL && PARTICIPANT !== undefined) {
    console.error('❌ Use --all OU --participant=<id>, nunca os dois.')
    process.exitCode = 1
    return
  }
  if (PARTICIPANT !== undefined && !PARTICIPANT) {
    console.error('❌ --participant exige um valor: --participant=<id|employeeNo>')
    process.exitCode = 1
    return
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Sync facial → terminal Hikvision (runner de teste)          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(DRY_RUN
    ? '🔍 DRY-RUN — valida e salva em ./tmp-faces/, NADA é enviado ao terminal\n'
    : '🚨 MODO REAL — os participantes abaixo serão gravados no terminal\n')

  // Preflight da cripto ANTES de qualquer seleção: chave errada faria todo
  // participante parecer "sem foto" e o run terminaria com "0, sucesso".
  const pre = await assertFaceCryptoReady()
  console.log(pre.checked === 'sample'
    ? `🔓 MASTER_KEY validada contra biometria real (participante ${pre.participantId})`
    : `🔓 MASTER_KEY presente; sem amostra criptografada para validar (${pre.detail})`)

  // O equipamento: é dele que sai o escopo de evento.
  const terminal = await resolveTerminal()

  // Alvos: escopo (alocação vigente) + filtro crítico de removidos vivem em
  // lib/hikvision/sync-targets.
  let targets: SyncTarget[]
  if (PARTICIPANT) {
    const found = await fetchSyncTarget(terminal.id, PARTICIPANT)
    if (!found.ok) {
      console.error(`❌ Recusado (${found.reason}): ${found.detail}`)
      process.exitCode = 1
      return
    }
    targets = [found.target]
    console.log(`📅 Alocação vigente: "${found.allocation.eventName}" (${found.allocation.startDate.toISOString().slice(0, 10)} → ${found.allocation.endDate.toISOString().slice(0, 10)})`)
    console.log(`🎯 Modo participante único: ${found.target.name} (employeeNo ${found.target.employeeNo})\n`)
  } else {
    const found = await fetchSyncTargets(terminal.id, { limit: LIMIT })
    if (!found.ok) {
      console.error(`❌ Recusado (${found.reason}): ${found.detail}`)
      process.exitCode = 1
      return
    }
    targets = found.targets
    console.log(`📅 Alocação vigente: "${found.allocation.eventName}" (${found.allocation.startDate.toISOString().slice(0, 10)} → ${found.allocation.endDate.toISOString().slice(0, 10)})`)
    console.log(`📋 Modo --all: ${targets.length} participante(s) elegível(is) DESTE evento${LIMIT ? ` (limite ${LIMIT})` : ''}\n`)
  }

  // ZERO NUNCA É SUCESSO. Um sync que não seleciona ninguém é indistinguível,
  // pelo código de saída, de um sync que funcionou — e é exatamente a cara de
  // uma falha de configuração (chave errada, alocação vencida, evento vazio).
  if (targets.length === 0) {
    console.error('❌ ZERO participantes elegíveis — isto é sempre suspeito, não sucesso.')
    console.error('   Verifique: (a) o evento alocado tem participantes aprovados com foto;')
    console.error('              (b) a alocação vigente aponta para o evento certo;')
    console.error('              (c) os participantes têm employeeNo atribuído.')
    process.exitCode = 1
    return
  }

  const conn = DRY_RUN ? null : await connectDevice(terminal)
  console.log('─'.repeat(64))

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const idx = `[${String(i + 1).padStart(String(targets.length).length)}/${targets.length}]`
    report.processed++
    try {
      if (conn) {
        await processLive(conn, t, idx)
        if (i < targets.length - 1) await new Promise(r => setTimeout(r, 300))
      } else {
        processDry(t, idx)
      }
    } catch (e: any) {
      console.log(`      ❌ erro inesperado: ${e?.message}`)
      fail(t, 'erro-inesperado', e?.message ?? String(e))
    }
    console.log('─'.repeat(64))
  }
}

main()
  .then(printReportIfRan)
  .catch(err => {
    console.error('\n🚨 Erro fatal:', err?.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

function printReportIfRan(): void {
  if (report.processed > 0) printReport()
}
