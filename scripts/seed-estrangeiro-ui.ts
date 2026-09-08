/**
 * Semeia no BANCO DE TESTE um evento com `allowForeignDocument` ligado, um
 * stand e um token de cadastro — para exercitar o FORMULÁRIO no navegador.
 *
 * Temporário: serve à conferência da marcação "não tenho CPF". Imprime o link.
 * `--limpar` remove o que foi semeado (casa pelo prefixo do slug).
 *
 *   .\scripts\testar.ps1 scripts\seed-estrangeiro-ui.ts
 *   .\scripts\testar.ps1 -Comando 'npx tsx scripts/seed-estrangeiro-ui.ts --limpar'
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('seed-estrangeiro-ui.ts')

import { randomBytes, createHash } from 'crypto'
import { prisma } from '../lib/prisma'

const PREFIXO = 'estrui-'

async function limpar() {
  const evs = await prisma.event.findMany({
    where: { slug: { startsWith: PREFIXO } },
    select: { id: true, slug: true }
  })
  for (const e of evs) {
    await prisma.participant.deleteMany({ where: { eventId: e.id } })
    await prisma.standAccessToken.deleteMany({ where: { stand: { eventId: e.id } } })
    await prisma.stand.deleteMany({ where: { eventId: e.id } })
    await prisma.eventConfig.deleteMany({ where: { eventId: e.id } })
    await prisma.auditLog.deleteMany({ where: { eventId: e.id } })
    await prisma.event.delete({ where: { id: e.id } })
    console.log('removido:', e.slug)
  }
  if (evs.length === 0) console.log('nada a remover')
}

async function main() {
  if (process.argv.includes('--limpar')) return limpar()

  const agora = new Date()
  const suf = Date.now().toString(36)
  const ev = await prisma.event.create({
    data: {
      name: 'Teste Estrangeiro (UI)', slug: PREFIXO + suf, code: 'ESTRUI-' + suf.toUpperCase(),
      startDate: agora, endDate: new Date(agora.getTime() + 7 * 86400000),
      status: 'active', requiresApprovalForAccess: true,
      // requireFace false: a conferência aqui é do formulário, não da captura.
      eventConfigs: { create: { requireFace: false, allowForeignDocument: true } }
    }
  })
  const stand = await prisma.stand.create({
    data: {
      eventId: ev.id, code: 'CASA-TESTE', name: 'Casa de Teste', maxRegistrations: 20,
      responsibleEmail: 'teste@exemplo.invalid', responsibleName: 'Responsável Teste'
    }
  })
  const raw = randomBytes(32).toString('base64url')
  await prisma.standAccessToken.create({
    data: { standId: stand.id, tokenHash: createHash('sha256').update(raw).digest('hex'), scope: 'register' }
  })

  console.log('')
  console.log('evento :', ev.slug, '| allowForeignDocument: true | requireFace: false')
  console.log('stand  :', stand.name)
  console.log('')
  console.log('LINK:  http://localhost:3000/stand/' + raw + '/cadastro')
  console.log('')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
