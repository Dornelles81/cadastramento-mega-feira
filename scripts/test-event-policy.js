// Teste dos efeitos colaterais da configuração da política (Fase 7 — UI):
// 1. Reduzir substitutionsPerSlot com cota já consumida acima do novo limite
//    → stand apenas bloqueia novas trocas (sem estado negativo nem erro).
// 2. Alterar dayResetHour com locks ativos → locks existentes mantêm o
//    horário com que foram criados; só exclusões novas usam o novo horário.
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

async function register(token, name, cpf) {
  const r = await fetch(`${BASE}/api/stand-registration`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name, cpf, email: '', phone: '51999990000', consent: true, faceImage: TINY_JPEG, customData: {} })
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

async function remove(token, participantId, reason) {
  const r = await fetch(`${BASE}/api/stand-removal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, participantId, reason })
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

async function main() {
  const event = await prisma.event.findUnique({ where: { slug: 'treinamento-credenciamento' } })
  const stand = await prisma.stand.findFirst({
    where: { eventId: event.id, isActive: true, accessTokens: { none: { revokedAt: null } } }
  })
  console.log('Stand:', stand.name)

  const orig = {
    max: stand.maxRegistrations,
    start: event.startDate,
    quota: event.substitutionQuotaEnabled,
    perSlot: event.substitutionsPerSlot,
    resetHour: event.dayResetHour
  }
  await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: 2, currentCount: 0, substitutionsUsed: 0 } })
  const token = randomBytes(32).toString('base64url')
  const tokenRow = await prisma.standAccessToken.create({
    data: { standId: stand.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) }
  })
  const cpfs = [2201, 2202, 2203, 2204].map(genCpf)

  try {
    console.log('\n— Caso 1: reduzir substitutionsPerSlot abaixo do já consumido')
    // cota generosa: 2 vagas × 2 = 4 trocas; consome 2
    await prisma.event.update({
      where: { id: event.id },
      data: { substitutionQuotaEnabled: true, substitutionsPerSlot: 2, startDate: new Date(Date.now() - 3600_000) }
    })
    for (let i = 0; i < 2; i++) {
      const r = await register(token, `Policy Consome ${i}`, cpfs[i])
      const rem = await remove(token, r.json.registrationId, `consumo ${i}`)
      if (rem.status !== 200) throw new Error(`troca ${i} falhou: ${rem.status}`)
    }
    let used = (await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true } })).substitutionsUsed
    console.log('  consumido com limite 4:', used, used === 2 ? '✓' : '✗')

    // ADMIN reduz a régua: substitutionsPerSlot 2 → 1 ⇒ novo limite = 2×1 = 2 (já atingido)
    await prisma.event.update({ where: { id: event.id }, data: { substitutionsPerSlot: 1 } })
    const r = await register(token, 'Policy Bloqueada', cpfs[2])
    const rem = await remove(token, r.json.registrationId, 'acima do novo limite')
    used = (await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true } })).substitutionsUsed
    const ok1 = rem.status === 403 && used === 2
    console.log('  troca após redução:', rem.status, '(esperado 403) | substitutionsUsed:', used, '(esperado 2, sem negativo)', ok1 ? '✓' : '✗ FALHOU')
    console.log('  mensagem:', rem.json.message)
    // participante segue ativo (exclusão não aconteceu)
    const pAtivo = await prisma.participant.findUnique({ where: { id: r.json.registrationId }, select: { status: true } })
    console.log('  participante intacto após bloqueio:', pAtivo.status === 'active' ? '✓' : '✗')
    await prisma.event.update({ where: { id: event.id }, data: { substitutionQuotaEnabled: false } })

    console.log('\n— Caso 2: alterar dayResetHour não recalcula locks existentes')
    // cria lock com a virada às 4h
    await prisma.event.update({ where: { id: event.id }, data: { dayResetHour: 4 } })
    await prisma.accessLog.create({ data: { participantId: r.json.registrationId, eventId: event.id, type: 'ENTRY', verificationMethod: 'MANUAL' } })
    const rem4 = await remove(token, r.json.registrationId, 'lock com virada 4h')
    const lock4 = new Date(rem4.json.slotLockedUntil)
    console.log('  lock criado (virada 4h):', lock4.toISOString())

    // ADMIN muda a virada para 10h
    await prisma.event.update({ where: { id: event.id }, data: { dayResetHour: 10 } })
    const lockDepois = (await prisma.participant.findUnique({ where: { id: r.json.registrationId }, select: { slotLockedUntil: true } })).slotLockedUntil
    const ok2a = lockDepois.getTime() === lock4.getTime()
    console.log('  lock existente após mudança p/ 10h:', lockDepois.toISOString(), ok2a ? '✓ inalterado' : '✗ RECALCULOU')

    // nova exclusão com check-in usa a virada nova (10h)
    const r2 = await register(token, 'Policy Lock10', cpfs[3])
    await prisma.accessLog.create({ data: { participantId: r2.json.registrationId, eventId: event.id, type: 'ENTRY', verificationMethod: 'MANUAL' } })
    const rem10 = await remove(token, r2.json.registrationId, 'lock com virada 10h')
    const lock10 = new Date(rem10.json.slotLockedUntil)
    const spHour = (lock10.getUTCHours() - 3 + 24) % 24
    console.log('  novo lock (virada 10h):', lock10.toISOString(), '| hora SP:', spHour, spHour === 10 ? '✓ usa o novo horário' : '✗')
  } finally {
    await prisma.participant.deleteMany({ where: { eventId: event.id, cpf: { in: cpfs } } })
    await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: orig.max, currentCount: 0, substitutionsUsed: 0 } })
    await prisma.event.update({
      where: { id: event.id },
      data: { substitutionQuotaEnabled: orig.quota, substitutionsPerSlot: orig.perSlot, dayResetHour: orig.resetHour, startDate: orig.start }
    })
    await prisma.standAccessToken.update({ where: { id: tokenRow.id }, data: { revokedAt: new Date() } })
    console.log('\nlimpeza concluída (stand, evento e participantes restaurados)')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
