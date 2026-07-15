/**
 * Semeia o cenário do teste de carga NO BRANCH descartável do Neon.
 *
 * Cria um stand com maxRegistrations=50 e emite um token novo (scope 'register').
 * O token existe SÓ no branch: se o app estiver apontado para produção por engano,
 * validateStandToken devolve null → 50× 404 e ZERO escrita. É a trava de segurança
 * do teste, não só uma conveniência.
 *
 *   npx tsx scripts/loadtest/seed-branch.ts
 */
import { config as loadEnv } from 'dotenv'
import { randomBytes, createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'

// override: o tsx auto-injeta .env.local (produção) em process.env, e o dotenv
// NÃO sobrescreve o que já existe. Sem override, este script rodaria em produção.
loadEnv({ path: '.env.loadtest', override: true })

const DIRECT_URL = process.env.DIRECT_URL
if (!DIRECT_URL) {
  console.error('DIRECT_URL ausente — rode com .env.loadtest presente.')
  process.exit(1)
}

// TRAVA: só opera no branch descartável.
const host = new URL(DIRECT_URL).host
if (!host.startsWith('ep-hidden-field-')) {
  console.error(`❌ ABORTADO: DIRECT_URL aponta para "${host}", que não é o branch de teste.`)
  process.exit(1)
}

const EVENT = process.argv.find((a) => a.startsWith('--event='))?.split('=')[1] ?? 'expofest-2026'
const MAX = parseInt(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1] ?? '50', 10)

const prisma = new PrismaClient({ datasources: { db: { url: DIRECT_URL } }, log: ['error'] })

async function main() {
  console.log(`branch: ${host}\n`)

  const event = await prisma.event.findFirst({
    where: { OR: [{ slug: EVENT.toLowerCase() }, { code: { equals: EVENT, mode: 'insensitive' } }] },
    include: { eventConfigs: true },
  })
  if (!event) {
    console.error(`❌ Evento "${EVENT}" não existe no branch.`)
    process.exit(1)
  }

  const terminals = await prisma.terminal.count({ where: { eventId: event.id, isActive: true } })
  console.log(`evento          : ${event.name} (${event.code})`)
  console.log(`requireFace     : ${event.eventConfigs?.requireFace !== false}`)
  console.log(`exige aprovação : ${event.requiresApprovalForAccess}  → fan-out no POST: ${event.requiresApprovalForAccess === false ? `SIM (${terminals} terminais)` : 'não'}`)

  // Stand descartável, idempotente
  const code = 'LOADTEST-50'
  const existing = await prisma.stand.findFirst({ where: { code, eventId: event.id } })
  const stand = existing
    ? await prisma.stand.update({
        where: { id: existing.id },
        data: { maxRegistrations: MAX, isActive: true, currentCount: 0 },
      })
    : await prisma.stand.create({
        data: {
          eventId: event.id,
          eventCode: event.code,
          name: 'Stand Teste de Carga',
          code,
          maxRegistrations: MAX,
          isActive: true,
        },
      })

  const occupied = await prisma.participant.count({
    where: { standId: stand.id, status: 'active', isDeleted: false },
  })
  console.log(`\nstand           : ${stand.name} (${stand.code})`)
  console.log(`vagas           : ${occupied}/${stand.maxRegistrations} ocupadas → ${stand.maxRegistrations - occupied} livres`)

  // Token novo (mesmo formato do gerador real: 32 bytes base64url = 43 chars)
  const raw = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(raw).digest('hex')
  await prisma.standAccessToken.create({
    data: { standId: stand.id, tokenHash, scope: 'register' },
  })

  console.log(`\n✅ token emitido (scope=register, existe SÓ no branch):\n\n${raw}\n`)
  console.log(`Rode:\n  npx tsx scripts/loadtest/run.ts --mode=stand --token=${raw} --n=50`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
