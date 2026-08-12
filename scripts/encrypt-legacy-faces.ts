/**
 * Migração: criptografa imagens faciais legadas armazenadas em plaintext.
 *
 * O que faz, por participante com faceImageUrl em base64 plaintext:
 *   1. Criptografa a data URL com AES-256-GCM e grava em faceData
 *   2. Zera faceImageUrl
 *
 * ⚠️ ANTES DE EXECUTAR:
 *   - Faça backup/branch do banco no Neon (console.neon.tech → Branches)
 *   - Garanta MASTER_KEY definida no ambiente (a mesma que a aplicação usa)
 *
 * Execução:
 *   npx tsx scripts/encrypt-legacy-faces.ts --dry-run   # só relata
 *   npx tsx scripts/encrypt-legacy-faces.ts             # migra de fato
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { encryptString, isEncryptedPayload } from '../lib/crypto'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 25

async function main() {
  if (!process.env.MASTER_KEY || process.env.MASTER_KEY.length < 32) {
    console.error('❌ MASTER_KEY ausente ou curta demais (mínimo 32 caracteres). Abortando.')
    process.exit(1)
  }

  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (nenhuma escrita)' : 'MIGRAÇÃO REAL'}`)

  let migrated = 0
  let skipped = 0
  let alreadyEncrypted = 0
  let errors = 0
  const processedIds = new Set<string>()

  for (;;) {
    // Registros migrados saem do filtro; os já processados (erros/dry-run)
    // são excluídos explicitamente para evitar loop infinito.
    const batch = await prisma.participant.findMany({
      where: {
        faceImageUrl: { startsWith: 'data:' },
        id: { notIn: Array.from(processedIds) }
      },
      select: { id: true, faceImageUrl: true, faceData: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' }
    })

    if (batch.length === 0) break
    for (const p of batch) processedIds.add(p.id)

    for (const p of batch) {
      try {
        if (p.faceData && isEncryptedPayload(Buffer.from(p.faceData))) {
          // Já migrado em execução anterior — só limpa o plaintext
          alreadyEncrypted++
          if (!DRY_RUN) {
            await prisma.participant.update({
              where: { id: p.id },
              data: { faceImageUrl: null }
            })
          }
          continue
        }

        if (!p.faceImageUrl) {
          skipped++
          continue
        }

        const encrypted = encryptString(p.faceImageUrl)

        if (!DRY_RUN) {
          await prisma.participant.update({
            where: { id: p.id },
            data: { faceData: encrypted, faceImageUrl: null }
          })
        }
        migrated++
      } catch (err) {
        errors++
        console.error(`  ❌ Erro no participante ${p.id}:`, (err as Error).message)
      }
    }

    console.log(`  ... processados até agora: ${migrated + skipped + alreadyEncrypted + errors}`)
  }

  console.log('\n===== RESULTADO =====')
  console.log(`Migrados:          ${migrated}`)
  console.log(`Já criptografados: ${alreadyEncrypted}`)
  console.log(`Ignorados:         ${skipped}`)
  console.log(`Erros:             ${errors}`)
  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
