/**
 * Teste em dev (sem device) da base de identidade da Fase 1:
 * employeeNo sequencial global + cardNumber aleatório 16-díg com Luhn.
 *
 * Verifica: sequencial sem buraco/colisão, cardNo Luhn-válido e único, nunca
 * null para elegível, elegibilidade respeitada (não-elegível não recebe nada),
 * e imutabilidade (segunda atribuição não muda nada). Limpa tudo no final.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { assignIdentityIfEligible, luhnValid, generateCardNumber } from '../lib/agent/identity'

const SUF = `idtest-${Date.now()}`
const FACE = encryptString('data:image/jpeg;base64,/9j/FAKEFACE-' + SUF)
let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

async function main() {
  const created: string[] = []
  let eventId = ''
  try {
    // sanidade do gerador, isolado
    console.log('=== gerador de cardNumber (isolado) ===')
    let allLuhn = true, all16 = true
    const seen = new Set<string>()
    let dup = false
    for (let i = 0; i < 5000; i++) {
      const c = generateCardNumber()
      if (c.length !== 16) all16 = false
      if (!luhnValid(c)) allLuhn = false
      if (seen.has(c)) dup = true
      seen.add(c)
    }
    check('5000 cardNo: todos 16 dígitos', all16)
    check('5000 cardNo: todos passam Luhn', allLuhn)
    check('5000 cardNo: sem colisão no lote', !dup)

    const now = new Date()
    const ev = await prisma.event.create({
      data: { name: 'IDENTITY TEST', slug: `id-${SUF}`, code: `ID-${SUF}`, startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true }
    })
    eventId = ev.id

    // 6 elegíveis
    const eligibles: string[] = []
    for (let i = 0; i < 6; i++) {
      const p = await prisma.participant.create({
        data: { eventId, name: `Elegivel ${i}`, cpf: `${Date.now()}${i}`.slice(-11), status: 'active', isDeleted: false, approvalStatus: 'approved', faceData: FACE }
      })
      eligibles.push(p.id); created.push(p.id)
    }
    // não-elegíveis: sem face, não aprovado, deletado, removido
    const semFace = await prisma.participant.create({ data: { eventId, name: 'SemFace', cpf: `${Date.now()}a`.slice(-11), status: 'active', isDeleted: false, approvalStatus: 'approved' } })
    const naoAprov = await prisma.participant.create({ data: { eventId, name: 'NaoAprov', cpf: `${Date.now()}b`.slice(-11), status: 'active', isDeleted: false, approvalStatus: 'pending', faceData: FACE } })
    const deletado = await prisma.participant.create({ data: { eventId, name: 'Deletado', cpf: `${Date.now()}c`.slice(-11), status: 'active', isDeleted: true, approvalStatus: 'approved', faceData: FACE } })
    const removido = await prisma.participant.create({ data: { eventId, name: 'Removido', cpf: `${Date.now()}d`.slice(-11), status: 'removed', isDeleted: false, approvalStatus: 'approved', faceData: FACE } })
    const inelegiveis = [semFace.id, naoAprov.id, deletado.id, removido.id]
    created.push(...inelegiveis)

    console.log('\n=== atribuição: elegíveis recebem, não-elegíveis não ===')
    const results: any[] = []
    for (const id of eligibles) results.push(await assignIdentityIfEligible(id))
    for (const id of inelegiveis) await assignIdentityIfEligible(id)

    const dbEleg = await prisma.participant.findMany({ where: { id: { in: eligibles } }, select: { id: true, employeeNo: true, cardNumber: true } })
    const dbInel = await prisma.participant.findMany({ where: { id: { in: inelegiveis } }, select: { id: true, name: true, employeeNo: true, cardNumber: true } })

    check('todos os 6 elegíveis com employeeNo não-null', dbEleg.every(p => !!p.employeeNo))
    check('todos os 6 elegíveis com cardNumber não-null', dbEleg.every(p => !!p.cardNumber))
    check('employeeNo numérico, 8 dígitos', dbEleg.every(p => /^\d{8}$/.test(p.employeeNo!)))
    check('cardNumber numérico, 16 dígitos', dbEleg.every(p => /^\d{16}$/.test(p.cardNumber!)))
    check('cardNumber todos passam Luhn', dbEleg.every(p => luhnValid(p.cardNumber!)))

    // sequencial sem buraco/colisão dentro do lote
    const nums = dbEleg.map(p => Number(p.employeeNo)).sort((a, b) => a - b)
    const unicos = new Set(nums).size === nums.length
    const gapless = nums[nums.length - 1] - nums[0] === nums.length - 1
    check('employeeNo sem colisão (todos únicos)', unicos, nums)
    check('employeeNo sequencial sem buraco no lote', gapless, { min: nums[0], max: nums[nums.length - 1] })

    // cardNumber único entre os elegíveis
    const cards = dbEleg.map(p => p.cardNumber)
    check('cardNumber único entre elegíveis', new Set(cards).size === cards.length)

    check('não-elegíveis NÃO receberam employeeNo nem cardNumber',
      dbInel.every(p => p.employeeNo === null && p.cardNumber === null),
      dbInel.map(p => ({ n: p.name, emp: p.employeeNo, card: p.cardNumber })))

    console.log('\n=== imutabilidade: segunda atribuição não muda nada ===')
    const before = dbEleg[0]
    const again = await assignIdentityIfEligible(before.id)
    check('reatribuir não altera employeeNo/cardNumber', again.employeeNo === before.employeeNo && again.cardNumber === before.cardNumber && again.assigned === false)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    for (const id of created) await prisma.participant.deleteMany({ where: { id } })
    if (eventId) { await prisma.auditLog.deleteMany({ where: { eventId } }); await prisma.event.deleteMany({ where: { id: eventId } }) }
    await prisma.$disconnect()
  }
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1) })
