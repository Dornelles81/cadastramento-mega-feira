/**
 * Migração: cifra os documentos LEGADOS (imageData em claro) no banco.
 *
 *   npx tsx scripts/migrate-encrypt-documents.ts            # DRY-RUN (default, NÃO escreve)
 *   npx tsx scripts/migrate-encrypt-documents.ts --apply    # ESCREVE (irreversível)
 *
 * Idempotente: encryptDocuments só cifra o que está em claro (data:), deixa o
 * já-cifrado intacto. Pode re-rodar sem dano. Requer MASTER_KEY (mesma da face).
 *
 * ⚠️ --apply é mudança de dado em PRODUÇÃO. Rodar só com branch Neon de backup.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptDocuments, countPlaintextDocs } from '../lib/documents'

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`=== Migração de documentos — modo: ${APPLY ? '🔴 APPLY (escreve)' : '🟢 DRY-RUN (não escreve)'} ===\n`)

  // Só participantes que TÊM algo no campo documents (evita varrer os {} vazios pesadamente)
  const rows = await prisma.participant.findMany({
    where: { documents: { not: { equals: null } } },
    select: { id: true, name: true, eventId: true, documents: true },
  })

  let participantsComDoc = 0
  let participantsComPlaintext = 0
  let blobsEmClaro = 0
  let blobsJaCifrados = 0
  const porEvento: Record<string, { participantes: number; blobs: number }> = {}

  const alvos: { id: string; documents: any }[] = []

  for (const p of rows) {
    const docs = p.documents as any
    if (!docs || typeof docs !== 'object' || Array.isArray(docs)) continue
    const total = Object.keys(docs).length
    if (total === 0) continue
    participantsComDoc++
    const claro = countPlaintextDocs(docs)
    blobsEmClaro += claro
    blobsJaCifrados += total - claro
    if (claro > 0) {
      participantsComPlaintext++
      const ev = p.eventId || '(sem evento)'
      porEvento[ev] = porEvento[ev] || { participantes: 0, blobs: 0 }
      porEvento[ev].participantes++
      porEvento[ev].blobs += claro
      alvos.push({ id: p.id, documents: docs })
    }
  }

  console.log(`Participantes com algum documento:        ${participantsComDoc}`)
  console.log(`Participantes com documento EM CLARO:     ${participantsComPlaintext}`)
  console.log(`Blobs (imageData) em claro a cifrar:      ${blobsEmClaro}`)
  console.log(`Blobs já cifrados (serão deixados):       ${blobsJaCifrados}`)
  if (participantsComPlaintext > 0) {
    console.log('\nPor evento (eventId → participantes / blobs em claro):')
    for (const [ev, v] of Object.entries(porEvento)) {
      console.log(`  ${ev}: ${v.participantes} part. / ${v.blobs} blobs`)
    }
  }

  if (!APPLY) {
    console.log(`\n🟢 DRY-RUN: nada foi escrito. Para aplicar: --apply (com branch Neon de backup).`)
    await prisma.$disconnect()
    return
  }

  console.log(`\n🔴 APLICANDO em ${alvos.length} participante(s)...`)
  let ok = 0, erro = 0
  for (const a of alvos) {
    try {
      const cifrado = encryptDocuments(a.documents)
      await prisma.participant.update({ where: { id: a.id }, data: { documents: cifrado } })
      ok++
    } catch (e: any) {
      erro++
      console.error(`  ✗ ${a.id}: ${e?.message}`)
    }
  }
  console.log(`\nAplicado: ${ok} ok, ${erro} erro(s).`)

  // Verificação pós: recontar em claro (deve ser 0)
  const after = await prisma.participant.findMany({
    where: { documents: { not: { equals: null } } },
    select: { documents: true },
  })
  let restante = 0
  for (const p of after) restante += countPlaintextDocs(p.documents as any)
  console.log(`Verificação: blobs em claro restantes = ${restante} ${restante === 0 ? '✓' : '✗'}`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error('ERRO:', e?.message); process.exit(1) })
