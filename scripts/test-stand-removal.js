// Teste e2e da Fase 5 (exclusão com auditoria) contra o dev server local.
// Cria token+cadastro num stand de treinamento, exclui via API e verifica:
// biometria apagada, audit log, vaga liberada, fila iVMS e filtro do sync.
require('dotenv').config({ path: '.env.local' })
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

async function main() {
  const event = await prisma.event.findUnique({ where: { slug: 'treinamento-credenciamento' } })
  const stand = await prisma.stand.findFirst({
    where: { eventId: event.id, isActive: true, accessTokens: { none: { revokedAt: null } } }
  })
  console.log('Stand de teste:', stand.name)

  const token = randomBytes(32).toString('base64url')
  const tokenRow = await prisma.standAccessToken.create({
    data: { standId: stand.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) }
  })
  const cpf = genCpf(42)

  try {
    // 1. Cadastra via token
    const reg = await fetch(`${BASE}/api/stand-registration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: 'Teste Exclusao F5', cpf, email: '', phone: '51999990000', consent: true, faceImage: TINY_JPEG, customData: {} })
    })
    const regJson = await reg.json()
    console.log('cadastro →', reg.status, regJson.message)
    const pid = regJson.registrationId

    const before = await prisma.stand.findUnique({ where: { id: stand.id }, select: { currentCount: true } })
    console.log('currentCount após cadastro:', before.currentCount)

    // 2. Exclui
    const rem = await fetch(`${BASE}/api/stand-removal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, participantId: pid, reason: 'teste automatizado fase 5' })
    })
    const remJson = await rem.json()
    console.log('exclusão →', rem.status, remJson.message, '| dispositivo:', remJson.deviceRemoval)

    // 3. Estado do participante
    const p = await prisma.participant.findUnique({
      where: { id: pid },
      select: { status: true, removedAt: true, removedBy: true, faceData: true, faceImageUrl: true, documents: true, captureQuality: true, pendingDeviceRemoval: true }
    })
    console.log('status:', p.status, '| removedBy:', p.removedBy, '| removedAt:', !!p.removedAt)
    const bioClean = !p.faceData && !p.faceImageUrl && p.captureQuality === null
    console.log('biometria apagada:', bioClean ? '✓' : '✗ FALHOU', '| pendingDeviceRemoval:', p.pendingDeviceRemoval, '(coerente com', remJson.deviceRemoval + ')')

    // 4. Vaga liberada
    const after = await prisma.stand.findUnique({ where: { id: stand.id }, select: { currentCount: true } })
    console.log('currentCount após exclusão:', after.currentCount, after.currentCount === before.currentCount - 1 ? '✓ vaga liberada' : '✗')

    // 5. Audit log
    const log = await prisma.auditLog.findFirst({
      where: { action: 'PARTICIPANT_REMOVED', targetParticipantId: pid },
      select: { actorType: true, actorIdentifier: true, targetSnapshot: true, reason: true, ip: true, standId: true }
    })
    console.log('audit log:', log ? '✓' : '✗ AUSENTE', JSON.stringify(log))

    // 6. Excluir de novo → 404
    const rem2 = await fetch(`${BASE}/api/stand-removal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, participantId: pid })
    })
    console.log('re-exclusão →', rem2.status, '(esperado 404)')

    // 7. Cenário crítico do ADENDO: sync não recadastra removido
    //    (replica exatamente o where do fetchParticipants do sync)
    const wouldSync = await prisma.participant.findMany({
      where: {
        approvalStatus: 'approved', status: 'active', isDeleted: false,
        OR: [{ faceImageUrl: { not: null } }, { faceData: { not: null } }],
        ivimsSync: false
      },
      select: { id: true }
    })
    const reSynced = wouldSync.some(w => w.id === pid)
    console.log('sync recadastraria o removido?', reSynced ? '✗ SIM — FALHA GRAVE' : '✓ não')

    // 8. Painel não lista mais o removido
    const panel = await fetch(`${BASE}/stand/${token}`)
    const html = await panel.text()
    console.log('painel lista removido?', html.includes('Teste Exclusao F5') ? '✗ SIM' : '✓ não', `(HTTP ${panel.status})`)
  } finally {
    await prisma.participant.deleteMany({ where: { eventId: event.id, cpf } })
    await prisma.stand.update({ where: { id: stand.id }, data: { currentCount: 0 } })
    await prisma.standAccessToken.update({ where: { id: tokenRow.id }, data: { revokedAt: new Date() } })
    console.log('limpeza concluída (participante de teste, stand e token)')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
