// Valida a página de ajuda do painel: hora dinâmica, seção condicional de
// cota, links e 404 com token inválido. Restaura tudo ao final.
require('dotenv').config({ path: '.env.local', quiet: true })
const { PrismaClient } = require('@prisma/client')
const { randomBytes, createHash } = require('crypto')
const p = new PrismaClient()
const BASE = 'http://localhost:3000'

async function main() {
  const ev = await p.event.findUnique({ where: { slug: 'treinamento-credenciamento' } })
  const stand = await p.stand.findFirst({
    where: { eventId: ev.id, isActive: true, accessTokens: { none: { revokedAt: null } } }
  })
  const orig = { hour: ev.dayResetHour, quota: ev.substitutionQuotaEnabled, perSlot: ev.substitutionsPerSlot }
  const token = randomBytes(32).toString('base64url')
  const row = await p.standAccessToken.create({
    data: { standId: stand.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) }
  })

  try {
    // política custom: virada 6h + cota 2/vaga
    await p.event.update({ where: { id: ev.id }, data: { dayResetHour: 6, substitutionQuotaEnabled: true, substitutionsPerSlot: 2 } })

    let r = await fetch(`${BASE}/stand/${token}/ajuda`)
    let html = await r.text()
    console.log('ajuda (token válido):', r.status, r.status === 200 ? '✓' : '✗')
    const horaMatch = html.match(/a partir das[^.]{0,60}/)
    console.log('hora dinâmica 6h:', /a partir das(<[^>]*>|[^<])*6h/.test(html) ? '✓' : '✗', '|', horaMatch ? horaMatch[0].replace(/<[^>]+>/g, '') : '(trecho não achado)')
    console.log('seção Limite de trocas (cota ON):', html.includes('Limite de trocas') ? '✓' : '✗')
    const total = stand.maxRegistrations * 2
    console.log(`total calculado (${total} substituições):`, new RegExp(`${total}(<[^>]*>|[^<])*substitui`).test(html) ? '✓' : '✗')
    console.log('botão voltar ao painel:', html.includes('Voltar ao painel') ? '✓' : '✗')

    // cota OFF → seção some
    await p.event.update({ where: { id: ev.id }, data: { substitutionQuotaEnabled: false } })
    html = await (await fetch(`${BASE}/stand/${token}/ajuda`)).text()
    console.log('seção some com cota OFF:', html.includes('Limite de trocas') ? '✗ AINDA APARECE' : '✓')

    // painel tem o link de ajuda
    html = await (await fetch(`${BASE}/stand/${token}`)).text()
    console.log('painel linka /ajuda:', html.includes(`/stand/${token}/ajuda`) && html.includes('Como funciona') ? '✓' : '✗')

    // token inválido → 404 genérico
    r = await fetch(`${BASE}/stand/tokenInvalido1234567890abcdefghijklmnopqrst/ajuda`)
    console.log('token inválido:', r.status, '(esperado 404)', r.status === 404 ? '✓' : '✗')
  } finally {
    await p.event.update({
      where: { id: ev.id },
      data: { dayResetHour: orig.hour, substitutionQuotaEnabled: orig.quota, substitutionsPerSlot: orig.perSlot }
    })
    await p.standAccessToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    console.log('restaurado: política do evento e token revogado')
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
