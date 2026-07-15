/**
 * Remove os cadastros criados pelo teste de carga (customData.__loadtest = true).
 * HARD delete de propósito: são dados sintéticos, não podem virar lixo no roster
 * nem serem empurrados para os terminais.
 *
 *   npx tsx scripts/loadtest/cleanup.ts            # lista o que apagaria
 *   npx tsx scripts/loadtest/cleanup.ts --apply    # apaga
 */
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { LOADTEST_TAG } from './fixtures'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })
// --env-file=.env.loadtest limpa o BRANCH. override obrigatório (o tsx auto-injeta
// .env.local de produção e o dotenv não sobrescreve o que já existe).
const ENV_FILE = process.argv.find((a) => a.startsWith('--env-file='))?.split('=')[1]
if (ENV_FILE) loadEnv({ path: ENV_FILE, override: true })

const APPLY = process.argv.includes('--apply')
const DIRECT_URL = process.env.DIRECT_URL
if (!DIRECT_URL) {
  console.error('DIRECT_URL ausente.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasources: { db: { url: DIRECT_URL } }, log: ['error'] })

async function main() {
  console.log(`banco: ${new URL(DIRECT_URL!).host}\n`)

  const victims = await prisma.participant.findMany({
    where: { customData: { path: [LOADTEST_TAG], equals: true } },
    select: { id: true, name: true, cpf: true, standId: true, employeeNo: true },
  })

  if (victims.length === 0) {
    console.log('Nada marcado como __loadtest. Banco limpo.')
    return
  }

  console.log(`${victims.length} participante(s) de teste encontrados:`)
  for (const v of victims.slice(0, 5)) console.log(`  - ${v.name} (${v.cpf})`)
  if (victims.length > 5) console.log(`  ... +${victims.length - 5}`)

  // Sanidade: se algo sem o prefixo do teste aparecer aqui, aborta.
  const suspeito = victims.find((v) => !v.name.startsWith('Load Test VU'))
  if (suspeito) {
    console.error(`\n❌ ABORTADO: "${suspeito.name}" tem a tag mas não é do teste. Verifique à mão.`)
    process.exit(1)
  }

  if (!APPLY) {
    console.log('\n(dry-run) rode com --apply para apagar.')
    return
  }

  const ids = victims.map((v) => v.id)
  const standIds = [...new Set(victims.map((v) => v.standId).filter(Boolean) as string[])]

  const syncs = await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: ids } } })
  const parts = await prisma.participant.deleteMany({ where: { id: { in: ids } } })
  console.log(`\n🗑️  ${syncs.count} linha(s) de sync + ${parts.count} participante(s) removidos.`)

  // currentCount é cache de exibição: recalcula pela contagem canônica de ativos.
  for (const standId of standIds) {
    const occupied = await prisma.participant.count({
      where: { standId, status: 'active', isDeleted: false },
    })
    await prisma.stand.update({ where: { id: standId }, data: { currentCount: occupied } })
    console.log(`   stand ${standId}: currentCount → ${occupied}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
