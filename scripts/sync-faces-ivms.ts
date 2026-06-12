/**
 * sync-faces-ivms.ts
 * Mega Feira Tecnologia — Sincronização de faces → iVMS-4200 AC
 *
 * Descrição:
 *   Lê participantes aprovados do Neon, descriptografa as fotos faciais
 *   (AES-256-CBC) e envia para o iVMS-4200 AC via ISAPI, criando pessoas
 *   e vinculando faces para reconhecimento no terminal DS-K1T671M-L.
 *
 *   Seguro para rodar múltiplas vezes:
 *   - Ignora participantes já sincronizados (ivimsSync = true)
 *   - Ignora erros de "pessoa já existe" no iVMS
 *   - Marca ivimsSync = true + ivimsSyncedAt apenas após sucesso confirmado
 *
 * Uso:
 *   npx tsx scripts/sync-faces-ivms.ts
 *   npx tsx scripts/sync-faces-ivms.ts --force   ← re-sincroniza todos
 *   npx tsx scripts/sync-faces-ivms.ts --dry-run ← simula sem enviar
 *
 * Pré-requisitos:
 *   1. iVMS-4200 AC instalado e rodando no PC local
 *   2. Variáveis de ambiente configuradas (IVMS_HOST, IVMS_USER, IVMS_PASSWORD)
 *   3. Migration SQL executada no Neon (ver ao final deste arquivo)
 */

import { PrismaClient } from '@prisma/client'
import axios, { AxiosInstance } from 'axios'
import * as crypto from 'crypto'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Imports após o dotenv: lib/crypto valida MASTER_KEY em tempo de uso
import { getFaceImageDataUrl } from '../lib/face-image'
import { removeUserFromDevice } from '../lib/ivms'

// ── Flags de linha de comando ─────────────────
const args = process.argv.slice(2)
const FORCE_RESYNC = args.includes('--force')
const DRY_RUN     = args.includes('--dry-run')

// ── Configurações ─────────────────────────────
const CONFIG = {
  ivmsHost    : process.env.IVMS_HOST     ?? 'http://127.0.0.1:7660',
  ivmsUser    : process.env.IVMS_USER     ?? 'admin',
  ivmsPassword: process.env.IVMS_PASSWORD ?? '',
  ivmsFdlibId : process.env.IVMS_FDLIB_ID ?? '1',
  masterKey   : process.env.MASTER_KEY    ?? '',
  batchSize   : 20,
  delayMs     : 300,
}

// ── Tipos ─────────────────────────────────────
interface Participant {
  id            : string
  name          : string
  cpf           : string
  faceImageUrl  : string | null   // data:image/jpeg;base64,... — fonte real da foto
  faceData      : Buffer | null   // hash SHA-256 do metadata (não é a imagem)
  approvalStatus: string | null
  ivimsSync     : boolean
  ivimsSyncedAt : Date | null
}

interface SyncResult {
  success: number
  failed : number
  skipped: number
  errors : { name: string; cpf: string; error: string }[]
}

// ─────────────────────────────────────────────────────────
// 1. CRIPTOGRAFIA
// ─────────────────────────────────────────────────────────

function deriveAesKey(): Buffer {
  if (!CONFIG.masterKey) {
    throw new Error('MASTER_KEY não definida no .env')
  }
  return crypto.createHash('sha256').update(CONFIG.masterKey).digest()
}

/**
 * register.ts usa crypto.createCipher (API legada) que internamente chama
 * EVP_BytesToKey(MD5, sem salt, 1 iteração) para derivar chave+IV a partir
 * do sha256(MASTER_KEY). Os 16 bytes no início do buffer são um IV aleatório
 * que NUNCA foi usado na cifragem — apenas prefixado. Precisamos reproduzir
 * o EVP_BytesToKey para obter a chave e IV reais usados pelo createCipher.
 */
function evpBytesToKey(password: Buffer, keyLen: number, ivLen: number): { key: Buffer; iv: Buffer } {
  const result: Buffer[] = []
  let prev = Buffer.alloc(0)
  while (Buffer.concat(result).length < keyLen + ivLen) {
    prev = crypto.createHash('md5').update(Buffer.concat([prev, password])).digest()
    result.push(prev)
  }
  const derived = Buffer.concat(result)
  return {
    key: derived.subarray(0, keyLen),
    iv : derived.subarray(keyLen, keyLen + ivLen),
  }
}

function decryptFaceData(encryptedBuffer: Buffer): Buffer {
  const password  = deriveAesKey()            // sha256(MASTER_KEY) — usado como senha no createCipher
  const encrypted = encryptedBuffer.subarray(16) // pula os 16 bytes de IV aleatório não usado

  const { key, iv } = evpBytesToKey(password, 32, 16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * Extrai os bytes puros da imagem a partir do data URL (data:image/jpeg;base64,...).
 * register-fixed.ts salva a foto completa em faceImageUrl, não em faceData.
 */
function extractImageBytes(dataUrl: string): Buffer {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) {
    throw new Error('faceImageUrl não é um data URL válido')
  }
  return Buffer.from(dataUrl.slice(commaIdx + 1), 'base64')
}

function isValidImageBytes(buf: Buffer): boolean {
  if (buf.length < 100) return false
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  return isJpg || isPng
}

// ─────────────────────────────────────────────────────────
// 2. CLIENTE ISAPI (iVMS-4200 AC)
// ─────────────────────────────────────────────────────────

function createIvmsClient(): AxiosInstance {
  if (!CONFIG.ivmsPassword) {
    throw new Error('IVMS_PASSWORD não definida no .env')
  }
  return axios.create({
    baseURL : CONFIG.ivmsHost,
    auth    : { username: CONFIG.ivmsUser, password: CONFIG.ivmsPassword },
    headers : { 'Content-Type': 'application/json' },
    timeout : 15000,
  })
}

async function createPersonInIvms(
  client     : AxiosInstance,
  participant: Pick<Participant, 'name' | 'cpf'>
): Promise<void> {
  const payload = {
    UserInfo: {
      employeeNo: participant.cpf,
      name      : participant.name,
      userType  : 'normal',
      gender    : 'unknown',
      Valid     : {
        enable   : true,
        beginTime: '2025-01-01T00:00:00',
        endTime  : '2030-12-31T23:59:59',
      },
    },
  }
  await client.post('/ISAPI/AccessControl/UserInfo/SetUp?format=json', payload)
}

async function uploadFaceToIvms(
  client    : AxiosInstance,
  cpf       : string,
  imageBytes: Buffer
): Promise<void> {
  const payload = {
    FaceDataRecord: {
      employeeNo : cpf,
      faceLibType: 'blackFD',
      FDID       : CONFIG.ivmsFdlibId,
      faceData   : imageBytes.toString('base64'),
    },
  }
  await client.put('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', payload)
}

function isAlreadyExistsError(error: any): boolean {
  const msg = JSON.stringify(error?.response?.data ?? '').toLowerCase()
  return (
    msg.includes('exist') ||
    msg.includes('duplicate') ||
    msg.includes('already') ||
    error?.response?.status === 409
  )
}

// ─────────────────────────────────────────────────────────
// 3. BANCO DE DADOS
// ─────────────────────────────────────────────────────────

async function markAsSynced(prisma: PrismaClient, id: string): Promise<void> {
  await (prisma as any).participant.update({
    where: { id },
    data : { ivimsSync: true, ivimsSyncedAt: new Date() },
  })
}

async function fetchParticipants(prisma: PrismaClient): Promise<Participant[]> {
  const where: any = {
    approvalStatus: 'approved',
    // SPEC acesso-por-stand (ADENDO seção 5): NUNCA sincronizar removidos —
    // recadastraria no dispositivo quem foi excluído, reabrindo o acesso físico
    status        : 'active',
    isDeleted     : false,
    // Foto legada (faceImageUrl) ou criptografada GCM (faceData)
    OR: [
      { faceImageUrl: { not: null } },
      { faceData: { not: null } },
    ],
  }
  if (!FORCE_RESYNC) {
    where.ivimsSync = false
  }
  return (prisma as any).participant.findMany({
    where,
    select: {
      id            : true,
      name          : true,
      cpf           : true,
      faceImageUrl  : true,
      faceData      : true,
      approvalStatus: true,
      ivimsSync     : true,
      ivimsSyncedAt : true,
    },
    orderBy: { name: 'asc' },
  })
}

/**
 * Processa a fila de remoções pendentes no dispositivo (ADENDO seção 5):
 * participantes removidos cuja exclusão remota falhou na hora (ex.: exclusão
 * feita em produção, onde o iVMS não é alcançável).
 */
async function processPendingRemovals(prisma: PrismaClient): Promise<void> {
  const pending = await (prisma as any).participant.findMany({
    where : { pendingDeviceRemoval: true },
    select: { id: true, name: true, cpf: true },
  })
  if (pending.length === 0) {
    console.log('🧹 Fila de remoções no dispositivo: vazia\n')
    return
  }

  console.log(`🧹 Fila de remoções no dispositivo: ${pending.length} pendente(s)`)
  for (const p of pending) {
    if (DRY_RUN) {
      console.log(`   🔍 ${p.name} (${formatCpf(p.cpf)}) — dry-run, não removido`)
      continue
    }
    const ok = await removeUserFromDevice(p.cpf)
    if (ok) {
      await (prisma as any).participant.update({
        where: { id: p.id },
        data : { pendingDeviceRemoval: false },
      })
      console.log(`   ✅ ${p.name} (${formatCpf(p.cpf)}) removido do dispositivo`)
    } else {
      console.log(`   ❌ ${p.name} (${formatCpf(p.cpf)}) falhou — permanece na fila`)
    }
  }
  console.log('')
}

// ─────────────────────────────────────────────────────────
// 4. UTILITÁRIOS
// ─────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatCpf(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function printHeader(): void {
  console.log('\n╔════════════════════════════════════════════════╗')
  console.log('║  Mega Feira — Sync Faces → iVMS-4200 AC        ║')
  console.log('╚════════════════════════════════════════════════╝')
  if (DRY_RUN)      console.log('⚠️  MODO DRY-RUN — nenhum dado será enviado')
  if (FORCE_RESYNC) console.log('⚠️  MODO FORCE — re-sincronizando todos os aprovados')
  console.log(`📡 iVMS: ${CONFIG.ivmsHost}`)
  console.log(`👤 Usuário: ${CONFIG.ivmsUser}\n`)
}

function printSummary(result: SyncResult, total: number): void {
  console.log('\n╔════════════════════════════════════════════════╗')
  console.log('║  Resultado da sincronização                    ║')
  console.log('╠════════════════════════════════════════════════╣')
  console.log(`║  Total encontrados : ${String(total).padEnd(25)}║`)
  console.log(`║  ✅ Enviados        : ${String(result.success).padEnd(25)}║`)
  console.log(`║  ⏭️  Pulados         : ${String(result.skipped).padEnd(25)}║`)
  console.log(`║  ❌ Falhas          : ${String(result.failed).padEnd(25)}║`)
  console.log('╚════════════════════════════════════════════════╝')

  if (result.errors.length > 0) {
    console.log('\n❌ Detalhes das falhas:')
    result.errors.forEach(e => {
      console.log(`   • ${e.name} (${formatCpf(e.cpf)}): ${e.error}`)
    })
  }
}

// ─────────────────────────────────────────────────────────
// 5. MAIN
// ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printHeader()

  const prisma = new PrismaClient()
  const result: SyncResult = { success: 0, failed: 0, skipped: 0, errors: [] }

  try {
    const client = createIvmsClient()

    if (!DRY_RUN) {
      try {
        await client.get('/ISAPI/System/deviceInfo')
        console.log('✅ Conexão com iVMS-4200 AC confirmada\n')
      } catch {
        throw new Error(
          `Não foi possível conectar ao iVMS em ${CONFIG.ivmsHost}.\n` +
          `Verifique se o iVMS-4200 AC está aberto e as credenciais no .env.`
        )
      }
    }

    // Antes de cadastrar: processar exclusões pendentes (ADENDO seção 5)
    await processPendingRemovals(prisma)

    const participants = await fetchParticipants(prisma)
    const total = participants.length

    if (total === 0) {
      console.log('ℹ️  Nenhum participante pendente de sincronização.')
      console.log('   Use --force para re-sincronizar todos os aprovados.')
      return
    }

    console.log(`📋 ${total} participante(s) para sincronizar\n`)
    console.log('─'.repeat(50))

    for (let i = 0; i < participants.length; i++) {
      const p   = participants[i]
      const idx = `[${String(i + 1).padStart(String(total).length)}/${total}]`

      try {
        // Foto legada (faceImageUrl plaintext) ou nova (faceData AES-256-GCM)
        const dataUrl = getFaceImageDataUrl(p)
        if (!dataUrl) {
          throw new Error('Sem foto utilizável (nem faceImageUrl nem faceData decriptável)')
        }

        const imageBytes = extractImageBytes(dataUrl)

        if (!isValidImageBytes(imageBytes)) {
          throw new Error('Bytes de imagem inválidos — verifique o formato da foto')
        }

        if (DRY_RUN) {
          console.log(`${idx} 🔍 ${p.name} (${formatCpf(p.cpf)}) — dry-run OK (${imageBytes.length} bytes)`)
          result.skipped++
          continue
        }

        await createPersonInIvms(client, p).catch(err => {
          if (!isAlreadyExistsError(err)) throw err
        })

        await uploadFaceToIvms(client, p.cpf, imageBytes)
        await markAsSynced(prisma, p.id)

        console.log(`${idx} ✅ ${p.name} (${formatCpf(p.cpf)})`)
        result.success++

        if (i < participants.length - 1) {
          await delay(CONFIG.delayMs)
        }

      } catch (err: any) {
        const errorMsg = err?.response?.data
          ? JSON.stringify(err.response.data)
          : err.message

        console.error(`${idx} ❌ ${p.name} (${formatCpf(p.cpf)}) — ${errorMsg}`)
        result.errors.push({ name: p.name, cpf: p.cpf, error: errorMsg })
        result.failed++
      }
    }

  } finally {
    await prisma.$disconnect()
    printSummary(result, result.success + result.failed + result.skipped)
  }
}

main().catch(err => {
  console.error('\n🚨 Erro fatal:', err.message)
  process.exit(1)
})

// ─────────────────────────────────────────────────────────
// MIGRATION SQL — execute no Neon antes de rodar pela 1ª vez:
//
// ALTER TABLE participants
//   ADD COLUMN IF NOT EXISTS "ivimsSync"     BOOLEAN   NOT NULL DEFAULT false,
//   ADD COLUMN IF NOT EXISTS "ivimsSyncedAt" TIMESTAMP;
//
// Depois rode: npx prisma generate
// (sem prisma migrate, pois a coluna já existirá no banco)
// ─────────────────────────────────────────────────────────
