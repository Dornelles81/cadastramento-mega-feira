/**
 * Checagem de integridade pós-rodada no branch: nunca pode haver mais ativos que
 * maxRegistrations (limite rígido). Opcional: --set-max=N reconfigura o stand
 * (para o teste de oversell: menos vagas que requests) e zera a ocupação.
 *
 *   npx tsx scripts/loadtest/integrity.ts
 *   npx tsx scripts/loadtest/integrity.ts --set-max=30
 */
import { config } from 'dotenv'
config({ path: '.env.loadtest', override: true })
import { PrismaClient } from '@prisma/client'

const DIRECT_URL = process.env.DIRECT_URL!
if (!new URL(DIRECT_URL).host.startsWith('ep-hidden-field-')) {
  console.error('❌ não aponta para o branch de teste')
  process.exit(1)
}
const setMax = process.argv.find((a) => a.startsWith('--set-max='))?.split('=')[1]

const prisma = new PrismaClient({ datasources: { db: { url: DIRECT_URL } }, log: ['error'] })

async function main() {
  const stand = await prisma.stand.findFirst({
    where: { code: 'LOADTEST-50' },
    select: { id: true, currentCount: true, maxRegistrations: true },
  })
  if (!stand) {
    console.error('stand LOADTEST-50 não encontrado')
    process.exit(1)
  }

  if (setMax) {
    const max = parseInt(setMax, 10)
    await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: max, currentCount: 0 } })
    console.log(`stand reconfigurado: maxRegistrations=${max}, currentCount=0`)
    return
  }

  const active = await prisma.participant.count({
    where: { standId: stand.id, status: 'active', isDeleted: false },
  })
  console.log(`currentCount   = ${stand.currentCount}`)
  console.log(`maxRegistrations = ${stand.maxRegistrations}`)
  console.log(`ativos no stand  = ${active}`)
  console.log(`cache bate com ativos? ${stand.currentCount === active ? 'sim' : `NÃO (cache=${stand.currentCount}, ativos=${active})`}`)
  console.log(`OVERSELL? ${active > stand.maxRegistrations ? '🔴 SIM — LIMITE FURADO' : `✅ não (${active} <= ${stand.maxRegistrations})`}`)
}

main().finally(() => prisma.$disconnect())
