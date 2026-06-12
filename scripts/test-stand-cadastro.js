// Teste e2e da Fase 4 (cadastro via token) contra o dev server local.
// Usa um stand do evento de treinamento; cria token, faz cadastros de teste
// (incluindo corrida por última vaga) e limpa tudo ao final.
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const { randomBytes, createHash } = require('crypto')

const prisma = new PrismaClient()
const BASE = 'http://localhost:3000'

// CPFs válidos (gerados pelo algoritmo dos dígitos verificadores)
function genCpf(seed) {
  const n = []
  let s = seed
  for (let i = 0; i < 9; i++) { s = (s * 9301 + 49297) % 233280; n.push(s % 10) }
  let d1 = 0
  for (let i = 0; i < 9; i++) d1 += n[i] * (10 - i)
  d1 = ((d1 * 10) % 11) % 10
  let d2 = 0
  const m = [...n, d1]
  for (let i = 0; i < 10; i++) d2 += m[i] * (11 - i)
  d2 = ((d2 * 10) % 11) % 10
  return [...n, d1, d2].join('')
}

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

async function post(body) {
  const res = await fetch(`${BASE}/api/stand-registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  let json = {}
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  // 1. Stand de treino com 2 vagas
  const event = await prisma.event.findUnique({ where: { slug: 'treinamento-credenciamento' } })
  const stand = await prisma.stand.findFirst({
    where: { eventId: event.id, isActive: true, accessTokens: { none: { revokedAt: null } } }
  })
  console.log('Stand de teste:', stand.name, `(${stand.code})`)

  const originalMax = stand.maxRegistrations
  await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: 2, currentCount: 0 } })

  const token = randomBytes(32).toString('base64url')
  const tokenRow = await prisma.standAccessToken.create({
    data: {
      standId: stand.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600_000)
    }
  })

  const cpf1 = genCpf(1), cpf2 = genCpf(2), cpf3 = genCpf(3)
  const base = { token, email: '', phone: '51999990000', consent: true, faceImage: TINY_JPEG, customData: {} }

  try {
    // 2. Página de cadastro responde
    const page = await fetch(`${BASE}/stand/${token}/cadastro`)
    console.log('GET /stand/[token]/cadastro →', page.status, page.status === 200 ? 'OK' : 'FALHOU')

    // 3. Cadastro feliz
    const r1 = await post({ ...base, name: 'Teste Fase4 Um', cpf: cpf1 })
    console.log('cadastro 1 →', r1.status, r1.json.message)

    // 4. CPF duplicado
    const rd = await post({ ...base, name: 'Teste Duplicado', cpf: cpf1 })
    console.log('cpf duplicado →', rd.status, '(esperado 409)', rd.json.message)

    // 5. Corrida pela última vaga: 2 requisições simultâneas, 1 vaga restante
    const [ra, rb] = await Promise.all([
      post({ ...base, name: 'Teste Corrida A', cpf: cpf2 }),
      post({ ...base, name: 'Teste Corrida B', cpf: cpf3 })
    ])
    const wins = [ra, rb].filter(r => r.status === 201).length
    const fulls = [ra, rb].filter(r => r.status === 409).length
    console.log(`corrida → ${ra.status}/${rb.status} | sucessos: ${wins} (esperado 1), lotado: ${fulls} (esperado 1)`)

    // 6. Estado final do stand
    const after = await prisma.stand.findUnique({ where: { id: stand.id }, select: { currentCount: true } })
    const activeCount = await prisma.participant.count({ where: { standId: stand.id, status: 'active', isDeleted: false } })
    console.log('currentCount cache:', after.currentCount, '| contagem real ativos:', activeCount, after.currentCount === activeCount ? '✓ coerente' : '✗ DIVERGENTE')

    // 7. Token inválido
    const bad = await post({ ...base, token: randomBytes(32).toString('base64url'), name: 'X Y', cpf: genCpf(9) })
    console.log('token inválido →', bad.status, '(esperado 404)')

    // 8. Biometria criptografada?
    const p = await prisma.participant.findFirst({ where: { cpf: cpf1, eventId: event.id }, select: { faceData: true, faceImageUrl: true } })
    const buf = p.faceData ? Buffer.from(p.faceData) : null
    console.log('biometria: faceImageUrl =', p.faceImageUrl, '| faceData versão GCM =', buf ? buf[0] : null, buf && buf[0] === 1 ? '✓ criptografada' : '✗')
  } finally {
    // Limpeza: remove participantes de teste, restaura stand, revoga token
    const del = await prisma.participant.deleteMany({ where: { eventId: event.id, cpf: { in: [cpf1, cpf2, cpf3] } } })
    await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: originalMax, currentCount: 0 } })
    await prisma.standAccessToken.update({ where: { id: tokenRow.id }, data: { revokedAt: new Date() } })
    console.log(`limpeza: ${del.count} participantes de teste removidos, stand restaurado, token revogado`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
