/**
 * Migração: criptografa imagens faciais legadas armazenadas em plaintext.
 *
 * O que faz, por participante com faceImageUrl em base64 plaintext:
 *   1. Criptografa a data URL com AES-256-GCM e grava em faceData
 *   2. Grava faceVersion (sha256 do conteúdo EM CLARO) — sem ela o
 *      `faceNeedsUpdate` do reconcile nunca detecta troca de foto no registro
 *   3. Zera faceImageUrl
 *
 * ⚠️ IRREVERSÍVEL: o passo 3 apaga a única cópia legível. Não existe script
 * inverso e a chave é sha256(MASTER_KEY) direto — MASTER_KEY perdida ou
 * rotacionada = biometria destruída.
 *
 * Por isso o ramo "já criptografado" NÃO confia em `isEncryptedPayload`, que só
 * olha byte de versão e comprimento: ele descriptografa de fato (a tag GCM é o
 * único teste real da chave) antes de apagar o plaintext. Chave divergente →
 * registro PULADO intacto e reportado, nunca um apagamento cego.
 *
 * ⚠️ ANTES DE EXECUTAR:
 *   - Faça backup/branch do banco no Neon (console.neon.tech → Branches)
 *   - Garanta MASTER_KEY definida no ambiente (a mesma que a aplicação usa)
 *
 * Execução:
 *   npx tsx scripts/encrypt-legacy-faces.ts --dry-run   # só relata
 *   npx tsx scripts/encrypt-legacy-faces.ts             # migra de fato
 *
 * O dry-run roda a verificação de chave por completo (é só leitura), então
 * serve como auditoria de integridade mesmo sem intenção de migrar.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { decryptToString, encryptString, isEncryptedPayload } from '../lib/crypto'
import { faceVersionOf } from '../lib/face/version'

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
  let keyMismatch = 0
  let versionDiverged = 0
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
      select: { id: true, faceImageUrl: true, faceData: true, faceVersion: true },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' }
    })

    if (batch.length === 0) break
    for (const p of batch) processedIds.add(p.id)

    for (const p of batch) {
      try {
        if (p.faceData && isEncryptedPayload(Buffer.from(p.faceData))) {
          // Já migrado em execução anterior — resta limpar o plaintext. Mas
          // `isEncryptedPayload` não valida a chave: só descartamos a cópia
          // legível depois que a tag GCM confirmar que o cifrado ABRE.
          let plain: string
          try {
            plain = decryptToString(Buffer.from(p.faceData))
          } catch (err) {
            keyMismatch++
            console.error(
              `  ⚠️  Participante ${p.id}: faceData parece cifrado mas NÃO abre com esta ` +
                `MASTER_KEY (${(err as Error).message}). PULADO — apagar o faceImageUrl aqui ` +
                'destruiria a única cópia legível.'
            )
            continue
          }
          if (!plain.startsWith('data:')) {
            keyMismatch++
            console.error(
              `  ⚠️  Participante ${p.id}: faceData abriu mas não é um data URL de imagem. ` +
                'PULADO — conteúdo inesperado, o plaintext fica onde está.'
            )
            continue
          }

          // O faceData aqui não foi escrito por nós: só preenchemos a versão
          // quando falta. Divergência pré-existente é anomalia a reportar, não
          // a sobrescrever às cegas.
          const trueVersion = faceVersionOf(plain)
          const data: { faceImageUrl: null; faceVersion?: string } = { faceImageUrl: null }
          if (!p.faceVersion) {
            data.faceVersion = trueVersion
          } else if (p.faceVersion !== trueVersion) {
            versionDiverged++
            console.warn(
              `  ⚠️  Participante ${p.id}: faceVersion gravada não corresponde ao conteúdo de ` +
                'faceData. Mantida como está (só o plaintext foi limpo).'
            )
          }

          alreadyEncrypted++
          if (!DRY_RUN) {
            await prisma.participant.update({ where: { id: p.id }, data })
          }
          continue
        }

        if (!p.faceImageUrl) {
          skipped++
          continue
        }

        const encrypted = encryptString(p.faceImageUrl)
        // Nós autoramos este faceData, então a versão DESCREVE o que acabou de
        // ser gravado — vai junto no mesmo update. Sem ela o participante sai
        // cifrado porém "sem versão", e `faceNeedsUpdate` (lib/agent/reconcile)
        // exige as duas pontas conhecidas: troca de foto deixaria de ser
        // detectada nele para sempre.
        const faceVersion = faceVersionOf(p.faceImageUrl)

        if (!DRY_RUN) {
          await prisma.participant.update({
            where: { id: p.id },
            data: { faceData: encrypted, faceVersion, faceImageUrl: null }
          })
        }
        migrated++
      } catch (err) {
        errors++
        console.error(`  ❌ Erro no participante ${p.id}:`, (err as Error).message)
      }
    }

    console.log(
      '  ... processados até agora: ' +
        `${migrated + skipped + alreadyEncrypted + keyMismatch + errors}`
    )
  }

  console.log('\n===== RESULTADO =====')
  console.log(`Migrados:            ${migrated}`)
  console.log(`Já criptografados:   ${alreadyEncrypted}`)
  console.log(`Ignorados:           ${skipped}`)
  console.log(`Chave divergente:    ${keyMismatch}`)
  console.log(`faceVersion divergente: ${versionDiverged}`)
  console.log(`Erros:               ${errors}`)
  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)')

  if (keyMismatch > 0) {
    console.error(
      `\n❌ ${keyMismatch} registro(s) com faceData ilegível sob esta MASTER_KEY — nenhum ` +
        'deles foi tocado. Confirme que a chave é a MESMA que a aplicação usa em produção ' +
        'antes de rodar de novo; migrar com a chave errada apagaria o plaintext desses.'
    )
  }
  if (keyMismatch > 0 || errors > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
