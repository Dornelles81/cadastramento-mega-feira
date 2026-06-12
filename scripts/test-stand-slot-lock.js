// Teste e2e da Fase 7 (política de substituição / anti-rotatividade)
// contra o dev server local, no evento de treinamento. Cobre os critérios
// de aceite: lock por check-in no dia, liberação imediata sem check-in,
// check-in de ontem não trava, corrida com slot travado, coerência do
// currentCount e módulo de cota.
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
  console.log('Stand:', stand.name, '| dayResetHour:', event.dayResetHour)

  const origMax = stand.maxRegistrations
  await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: 1, currentCount: 0, substitutionsUsed: 0 } })
  const token = randomBytes(32).toString('base64url')
  const tokenRow = await prisma.standAccessToken.create({
    data: { standId: stand.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) }
  })
  const cpfs = [1101, 1102, 1103, 1104, 1105, 1106].map(genCpf)

  try {
    console.log('\n— Critério: sem check-in hoje → vaga libera na hora')
    let r = await register(token, 'F7 Sem Checkin', cpfs[0])
    let pid = r.json.registrationId
    let rem = await remove(token, pid, 'teste sem checkin')
    console.log('  exclusão:', rem.status, '| hadCheckinToday:', rem.json.hadCheckinToday, '| lock:', rem.json.slotLockedUntil ?? 'null', rem.json.hadCheckinToday === false && !rem.json.slotLockedUntil ? '✓' : '✗')
    r = await register(token, 'F7 Recadastro Imediato', cpfs[1])
    console.log('  recadastro imediato:', r.status, r.status === 201 ? '✓ vaga liberou' : '✗ BLOQUEOU')
    pid = r.json.registrationId

    console.log('\n— Critério: COM check-in hoje → vaga trava até a virada')
    await prisma.accessLog.create({ data: { participantId: pid, eventId: event.id, type: 'ENTRY', verificationMethod: 'MANUAL' } })
    rem = await remove(token, pid, 'teste com checkin')
    const lockedUntil = rem.json.slotLockedUntil
    console.log('  exclusão:', rem.status, '| hadCheckinToday:', rem.json.hadCheckinToday, '| lock até:', lockedUntil, rem.json.hadCheckinToday === true && lockedUntil ? '✓' : '✗')
    const pRow = await prisma.participant.findUnique({ where: { id: pid }, select: { slotLockedUntil: true, pendingDeviceRemoval: true, status: true } })
    console.log('  acesso físico revogado imediatamente (fila dispositivo):', pRow.pendingDeviceRemoval === true || pRow.status === 'removed' ? '✓' : '✗')

    console.log('\n— Critério: tentativa de cadastro com slot travado → bloqueada com mensagem clara')
    r = await register(token, 'F7 Tentativa Lock', cpfs[2])
    console.log('  cadastro:', r.status, '|', r.json.error, '|', r.json.message)
    const okLock = r.status === 409 && r.json.error === 'Slots locked' && /Próxima liberação/.test(r.json.message)
    console.log(' ', okLock ? '✓ bloqueado com próxima liberação' : '✗ FALHOU')

    console.log('\n— Critério: corrida — 2 cadastros simultâneos com slot travado → ambos falham')
    const [ra, rb] = await Promise.all([
      register(token, 'F7 Corrida A', cpfs[3]),
      register(token, 'F7 Corrida B', cpfs[4])
    ])
    console.log('  resultados:', ra.status, rb.status, ra.status === 409 && rb.status === 409 ? '✓' : '✗')

    console.log('\n— Critério: coerência do currentCount com slot travado')
    const standNow = await prisma.stand.findUnique({ where: { id: stand.id }, select: { currentCount: true } })
    console.log('  currentCount (cache):', standNow.currentCount, standNow.currentCount === 1 ? '✓ slot travado conta' : '✗')

    console.log('\n— Critério: após a virada (lock expirado) → cadastro permitido')
    await prisma.participant.update({ where: { id: pid }, data: { slotLockedUntil: new Date(Date.now() - 1000) } })
    r = await register(token, 'F7 Pos Virada', cpfs[2])
    console.log('  cadastro pós-expiração:', r.status, r.status === 201 ? '✓ liberou sozinho (recontagem na transação)' : '✗')
    const pid2 = r.json.registrationId

    console.log('\n— Critério: check-in de ONTEM (antes da virada) não trava')
    const ontem = new Date(Date.now() - 26 * 3600_000)
    await prisma.accessLog.create({ data: { participantId: pid2, eventId: event.id, type: 'ENTRY', verificationMethod: 'MANUAL', createdAt: ontem } })
    rem = await remove(token, pid2, 'checkin de ontem')
    console.log('  exclusão:', rem.status, '| hadCheckinToday:', rem.json.hadCheckinToday, '| lock:', rem.json.slotLockedUntil ?? 'null', rem.json.hadCheckinToday === false ? '✓ liberou na hora' : '✗ TRAVOU ERRADO')

    console.log('\n— Módulo de cota (ativando no evento de treinamento)')
    // startDate no passado para a cota valer "durante o evento"
    const origStart = event.startDate
    await prisma.event.update({ where: { id: event.id }, data: { substitutionQuotaEnabled: true, substitutionsPerSlot: 1, startDate: new Date(Date.now() - 3600_000) } })
    // limite = maxRegistrations(1) × 1 = 1 troca
    r = await register(token, 'F7 Cota 1', cpfs[5])
    rem = await remove(token, r.json.registrationId, 'consome cota 1')
    const usedAfter = (await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true } })).substitutionsUsed
    console.log('  1ª troca durante evento:', rem.status, '| substitutionsUsed:', usedAfter, usedAfter === 1 ? '✓ consumiu' : '✗')
    const quotaLog = await prisma.auditLog.count({ where: { standId: stand.id, action: 'SUBSTITUTION_QUOTA_CONSUMED' } })
    console.log('  audit SUBSTITUTION_QUOTA_CONSUMED:', quotaLog >= 1 ? '✓' : '✗')
    // próxima troca deve ser bloqueada (cota 1 esgotada)
    r = await register(token, 'F7 Cota 2', genCpf(1107))
    rem = await remove(token, r.json.registrationId, 'tentativa acima da cota')
    console.log('  2ª troca (cota esgotada):', rem.status, rem.status === 403 ? '✓ bloqueada no painel' : '✗', '|', rem.json.message)
    // pré-evento não consome: startDate no futuro
    await prisma.event.update({ where: { id: event.id }, data: { startDate: new Date(Date.now() + 86400_000) } })
    const lastPid = r.json.registrationId
    rem = await remove(token, lastPid, 'pre-evento nao consome')
    const usedPre = (await prisma.stand.findUnique({ where: { id: stand.id }, select: { substitutionsUsed: true } })).substitutionsUsed
    console.log('  exclusão pré-evento:', rem.status, '| substitutionsUsed segue:', usedPre, rem.status === 200 && usedPre === 1 ? '✓ não consumiu' : '✗')
    await prisma.event.update({ where: { id: event.id }, data: { substitutionQuotaEnabled: false, substitutionsPerSlot: 1, startDate: origStart } })

    console.log('\n— Auditoria: hadCheckinToday e slotLockedUntil no snapshot')
    const log = await prisma.auditLog.findFirst({
      where: { standId: stand.id, action: 'PARTICIPANT_REMOVED', targetSnapshot: { path: ['hadCheckinToday'], equals: true } },
      orderBy: { createdAt: 'desc' }, select: { targetSnapshot: true }
    })
    console.log('  snapshot com lock:', log ? JSON.stringify(log.targetSnapshot) : null, log && log.targetSnapshot.slotLockedUntil ? '✓' : '✗')
  } finally {
    await prisma.participant.deleteMany({ where: { eventId: event.id, cpf: { in: [...cpfs, genCpf(1107)] } } })
    await prisma.stand.update({ where: { id: stand.id }, data: { maxRegistrations: origMax, currentCount: 0, substitutionsUsed: 0 } })
    await prisma.standAccessToken.update({ where: { id: tokenRow.id }, data: { revokedAt: new Date() } })
    console.log('\nlimpeza concluída')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
