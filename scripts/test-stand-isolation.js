// Teste e2e de isolamento entre stands (SPEC, critério de aceite):
// nenhuma resposta do contexto /stand/[token] pode conter dados de outros
// stands, e o token de um stand não pode agir sobre credenciados de outro.
require('dotenv').config({ path: '.env.local', quiet: true })
const { PrismaClient } = require('@prisma/client')
const { randomBytes, createHash } = require('crypto')

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

function genCpf(seed) {
  const n = []; let s = seed
  for (let i = 0; i < 9; i++) { s = (s * 9301 + 49297) % 233280; n.push(s % 10) }
  let d1 = 0; for (let i = 0; i < 9; i++) d1 += n[i] * (10 - i); d1 = ((d1 * 10) % 11) % 10
  let d2 = 0; const m = [...n, d1]; for (let i = 0; i < 10; i++) d2 += m[i] * (11 - i); d2 = ((d2 * 10) % 11) % 10
  return [...n, d1, d2].join('')
}

async function createToken(standId) {
  const token = randomBytes(32).toString('base64url')
  const row = await prisma.standAccessToken.create({
    data: {
      standId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600_000)
    }
  })
  return { token, tokenId: row.id }
}

async function main() {
  const event = await prisma.event.findUnique({ where: { slug: 'treinamento-credenciamento' } })
  const [standA, standB] = await prisma.stand.findMany({
    where: { eventId: event.id, isActive: true, accessTokens: { none: { revokedAt: null } } },
    take: 2
  })
  console.log('Stand A:', standA.name, '| Stand B:', standB.name)

  const a = await createToken(standA.id)
  const b = await createToken(standB.id)
  const cpf = genCpf(77)
  const nomeUnico = `Isolamento Teste ${Date.now()}`
  let participantId = null

  try {
    // 1. Cadastra credenciado no stand A
    const reg = await fetch(`${BASE}/api/stand-registration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: a.token, name: nomeUnico, cpf, email: '', phone: '51999990000', consent: true, faceImage: TINY_JPEG, customData: {} })
    })
    const regJson = await reg.json()
    participantId = regJson.registrationId
    console.log('cadastro no stand A →', reg.status)

    // 2. Painel A mostra; painel B NÃO pode mostrar (nem nome, nem nome do stand A)
    const htmlA = await (await fetch(`${BASE}/stand/${a.token}`)).text()
    const htmlB = await (await fetch(`${BASE}/stand/${b.token}`)).text()
    console.log('painel A contém o credenciado:', htmlA.includes(nomeUnico) ? '✓' : '✗ FALHOU')
    console.log('painel B NÃO contém o credenciado:', htmlB.includes(nomeUnico) ? '✗ VAZOU' : '✓')
    console.log('painel B NÃO contém o stand A:', htmlB.includes(standA.name) ? '✗ VAZOU' : '✓')

    // 3. Token de B não pode excluir credenciado de A
    const remB = await fetch(`${BASE}/api/stand-removal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: b.token, participantId, reason: 'tentativa cruzada' })
    })
    console.log('exclusão cruzada (token B → credenciado A) →', remB.status, '(esperado 404)')
    const ainda = await prisma.participant.findUnique({ where: { id: participantId }, select: { status: true } })
    console.log('credenciado de A permanece ativo:', ainda.status === 'active' ? '✓' : '✗ FOI REMOVIDO')

    // 4. Cadastro com token de B não vaza para A: cria em B e confere standId
    const cpf2 = genCpf(78)
    const reg2 = await fetch(`${BASE}/api/stand-registration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: b.token, name: 'Isolamento B', cpf: cpf2, email: '', phone: '51999990000', consent: true, faceImage: TINY_JPEG, customData: {} })
    })
    const reg2Json = await reg2.json()
    const p2 = await prisma.participant.findUnique({ where: { id: reg2Json.registrationId }, select: { standId: true } })
    console.log('cadastro via token B vincula ao stand B:', p2.standId === standB.id ? '✓' : '✗ STAND ERRADO')

    // 5. Token revogado deixa de funcionar imediatamente
    await prisma.standAccessToken.update({ where: { id: a.tokenId }, data: { revokedAt: new Date() } })
    const revoked = await fetch(`${BASE}/stand/${a.token}`)
    console.log('painel com token revogado →', revoked.status, '(esperado 404)')
  } finally {
    await prisma.participant.deleteMany({ where: { eventId: event.id, cpf: { in: [genCpf(77), genCpf(78)] } } })
    await prisma.stand.updateMany({ where: { id: { in: [standA.id, standB.id] } }, data: { currentCount: 0 } })
    await prisma.standAccessToken.updateMany({ where: { id: { in: [a.tokenId, b.tokenId] } }, data: { revokedAt: new Date() } })
    console.log('limpeza concluída')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
