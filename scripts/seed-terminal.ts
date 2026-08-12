/**
 * seed-terminal.ts — cadastra um terminal físico e o aloca a um evento.
 *
 * Idempotente: rodar de novo atualiza o cadastro e não duplica a alocação.
 * A senha entra CRIPTOGRAFADA (AES-256-GCM, mesmo padrão do faceData) e nunca
 * é gravada em claro — vem de DEVICE_PASS só no momento do cadastro.
 *
 * Uso:
 *   DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts
 *   DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts --ip=192.168.1.30 --evento=treinamento-credenciamento
 *
 * Se o terminal estiver alcançável, modelo/firmware/serial são lidos do próprio
 * device (/ISAPI/System/deviceInfo) em vez de digitados.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { HikvisionClient } from '../lib/hikvision/client'
import { createAllocation } from '../lib/terminals/allocation'

const argv = process.argv.slice(2)
const arg = (n: string) => argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')

const IP        = arg('ip') || process.env.DEVICE_IP || '192.168.1.30'
const PORT      = Number(arg('porta') || process.env.DEVICE_PORT || 80)
const USE_HTTPS = (arg('https') || process.env.DEVICE_USE_HTTPS) === 'true'
const USER      = arg('usuario') || process.env.HIKVISION_USER || 'admin'
const PASS      = process.env.DEVICE_PASS || ''
const FDID      = arg('fdid') || process.env.DEVICE_FDID || '1'
const NOME      = arg('nome') || 'Terminal Bancada'
const EVENTO    = arg('evento') || 'treinamento-credenciamento'

/** Lê a identificação real do equipamento; null se não estiver alcançável. */
async function lerDeviceInfo(): Promise<{ deviceModel: string | null; firmwareVersion: string | null; serialNumber: string | null } | null> {
  if (!PASS) return null
  try {
    const c = new HikvisionClient({ ipAddress: IP, port: PORT, useHttps: USE_HTTPS, username: USER, password: PASS })
    const xml = String(await c.getDeviceInfo())
    const pick = (tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null
    return { deviceModel: pick('model'), firmwareVersion: pick('firmwareVersion'), serialNumber: pick('serialNumber') }
  } catch (e: any) {
    console.log(`⚠️  device não respondeu (${e?.message}) — cadastrando sem modelo/firmware/serial`)
    return null
  }
}

async function main() {
  const evento = await prisma.event.findFirst({
    where: { slug: EVENTO },
    select: { id: true, name: true, startDate: true, endDate: true }
  })
  if (!evento) throw new Error(`Evento com slug "${EVENTO}" não encontrado`)

  const existente = await prisma.terminal.findFirst({ where: { ipAddress: IP }, select: { id: true, passwordEncrypted: true } })
  if (!existente && !PASS) {
    throw new Error('Terminal novo exige a senha: DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts')
  }

  const info = await lerDeviceInfo()
  const dados = {
    name: NOME,
    ipAddress: IP,
    port: PORT,
    useHttps: USE_HTTPS,
    username: USER,
    fdid: FDID,
    isActive: true,
    ...(info ?? {}),
    // Senha só é reescrita quando DEVICE_PASS é fornecida (senão preserva a que
    // já está criptografada no banco).
    ...(PASS ? { passwordEncrypted: encryptString(PASS) } : {}),
    // DEPRECADO: mantido em sincronia com a alocação enquanto o fan-out da
    // Fase 2 (`sync-enqueue`) ainda ler `Terminal.eventId`. A fonte de verdade
    // do escopo do sync é a alocação abaixo.
    eventId: evento.id
  }

  const terminal = existente
    ? await prisma.terminal.update({ where: { id: existente.id }, data: dados })
    : await prisma.terminal.create({ data: dados })

  console.log(`${existente ? '♻️  atualizado' : '✅ criado'}: Terminal ${terminal.id}`)
  console.log(`   ${terminal.name} — ${terminal.ipAddress}:${terminal.port}`)
  console.log(`   modelo=${terminal.deviceModel ?? '(n/d)'} firmware=${terminal.firmwareVersion ?? '(n/d)'} serial=${terminal.serialNumber ?? '(n/d)'}`)
  console.log(`   FDID=${terminal.fdid} | senha criptografada: ${terminal.passwordEncrypted ? 'sim' : 'NÃO'}`)

  // Alocação ao evento, pelo período do próprio evento.
  const jaAlocado = await prisma.terminalEvent.findFirst({
    where: { terminalId: terminal.id, eventId: evento.id, isActive: true },
    select: { id: true, startDate: true, endDate: true }
  })
  if (jaAlocado) {
    console.log(`♻️  alocação já existe: ${jaAlocado.id} (${jaAlocado.startDate.toISOString().slice(0, 10)} → ${jaAlocado.endDate.toISOString().slice(0, 10)})`)
  } else {
    const aloc = await createAllocation({
      terminalId: terminal.id,
      eventId: evento.id,
      startDate: evento.startDate,
      endDate: evento.endDate
    })
    console.log(`✅ alocado a "${evento.name}": ${aloc.id} (${aloc.startDate.toISOString().slice(0, 10)} → ${aloc.endDate.toISOString().slice(0, 10)})`)
  }
}

main()
  .catch(e => { console.error('🚨', e?.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
