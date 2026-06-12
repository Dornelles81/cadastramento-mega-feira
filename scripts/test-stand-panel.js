// Teste manual da Fase 3: gera um token temporário para um stand SEM link
// ativo, imprime a URL do painel e o id do token para revogação posterior.
// Uso: node scripts/test-stand-panel.js          → cria token de teste
//      node scripts/test-stand-panel.js revoke <tokenId>  → revoga
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const { randomBytes, createHash } = require('crypto')

const prisma = new PrismaClient()

async function main() {
  const [, , cmd, arg] = process.argv

  if (cmd === 'revoke') {
    await prisma.standAccessToken.update({
      where: { id: arg },
      data: { revokedAt: new Date() }
    })
    console.log('Token de teste revogado:', arg)
    return
  }

  const stand = await prisma.stand.findFirst({
    where: {
      isActive: true,
      accessTokens: { none: { revokedAt: null } }
    },
    select: { id: true, name: true, code: true, maxRegistrations: true }
  })
  if (!stand) {
    console.log('Nenhum stand sem link ativo encontrado.')
    return
  }

  const token = randomBytes(32).toString('base64url')
  const row = await prisma.standAccessToken.create({
    data: {
      standId: stand.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdBy: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1h, só para teste
    }
  })

  console.log('Stand:', stand.name, `(${stand.code})`, '— limite', stand.maxRegistrations)
  console.log('tokenId (para revogar):', row.id)
  console.log('URL:', `http://localhost:3000/stand/${token}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
