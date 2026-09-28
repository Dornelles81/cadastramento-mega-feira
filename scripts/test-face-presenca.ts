/**
 * Teste do ESPELHO: `SQL_TEM_FOTO` (lib/face/presence) decide "tem foto?" no
 * banco, sem trazer os bytes; `getFaceImageDataUrl` (lib/face-image) decide
 * decriptando. As duas têm que concordar — é a garantia de que tirar o
 * `faceData` da reconciliação (fatura do Neon, set/2026) não mudou quem é
 * elegível.
 *
 * Regra da comparação: onde `getFaceImageDataUrl` LANÇA (foto que existe mas
 * não abre), o SQL tem que dizer "tem foto". Essa falha passa a ser acusada
 * pelo /api/agent/work, não pela reconciliação — decisão de 2026-09-28.
 *
 * Cobre também a reconciliação de ponta a ponta (chamando `reconcileTerminal`
 * direto, sem dev server): quem tem foto entra no desejado, quem só tem hash
 * legado vira órfão.
 *
 * Uso: .\scripts\testar.ps1 scripts\test-face-presenca.ts
 * Cria e apaga seus próprios dados.
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('test-face-presenca.ts')

import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { getFaceImageDataUrl } from '../lib/face-image'
import { idsComFoto, idsComFotoNoEvento } from '../lib/face/presence'
import { createAllocation } from '../lib/terminals/allocation'
import { reconcileTerminal } from '../lib/agent/reconcile'

const SUF = Date.now().toString().slice(-6)

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

/** Veredito do código: foto presente? Lançar = presente (existe, não abre). */
function temFotoPeloCodigo(p: { faceData: Buffer | null; faceImageUrl: string | null }): boolean {
  try {
    return getFaceImageDataUrl(p) !== null
  } catch {
    return true
  }
}

async function main() {
  const created: { events: string[]; participants: string[]; terminals: string[] } = { events: [], participants: [], terminals: [] }

  try {
    const FACE_URL = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF
    const cifrada = encryptString(FACE_URL)

    // Payload cifrado com um byte do ciphertext trocado: a tag GCM não confere.
    const corrompida = Buffer.from(cifrada)
    corrompida[corrompida.length - 1] ^= 0xff

    // Hash SHA-256 legado (32 bytes). Primeiro byte forçado ≠ 1 → não é payload.
    const hashLegado = createHash('sha256').update('legado-' + SUF).digest()
    hashLegado[0] = 0xab
    // Mesmo hash, mas com primeiro byte 1: o formato não o distingue de payload
    // cifrado (tamanho 32 > 29). As duas pontas têm que tratá-lo IGUAL.
    const hashComByte1 = Buffer.from(hashLegado)
    hashComByte1[0] = 0x01

    // Fronteira do tamanho: exatamente 1+12+16 = 29 bytes com a versão certa.
    const exatos29 = Buffer.alloc(29, 0x02)
    exatos29[0] = 0x01

    const casos: Array<{ nome: string; faceData: Buffer | null; faceImageUrl: string | null; esperado: boolean }> = [
      { nome: 'sem foto nenhuma', faceData: null, faceImageUrl: null, esperado: false },
      { nome: 'faceData cifrado válido', faceData: cifrada, faceImageUrl: null, esperado: true },
      { nome: 'faceData cifrado CORROMPIDO (código lança)', faceData: corrompida, faceImageUrl: null, esperado: true },
      { nome: 'cifrado que abre mas não é data URL (código lança)', faceData: encryptString('nao-e-imagem'), faceImageUrl: null, esperado: true },
      { nome: 'hash SHA-256 legado sozinho', faceData: hashLegado, faceImageUrl: null, esperado: false },
      { nome: 'hash legado com primeiro byte 1 (ambíguo)', faceData: hashComByte1, faceImageUrl: null, esperado: true },
      { nome: 'exatamente 29 bytes (fronteira)', faceData: exatos29, faceImageUrl: null, esperado: false },
      { nome: 'legado data URL em faceImageUrl', faceData: null, faceImageUrl: FACE_URL, esperado: true },
      { nome: 'legado http:// em faceImageUrl', faceData: null, faceImageUrl: 'http://exemplo.test/f.jpg', esperado: true },
      { nome: 'legado https:// em faceImageUrl', faceData: null, faceImageUrl: 'https://exemplo.test/f.jpg', esperado: true },
      { nome: 'faceImageUrl sem esquema reconhecido', faceData: null, faceImageUrl: 'ftp://exemplo.test/f.jpg', esperado: false },
      { nome: 'faceImageUrl "Data:" maiúsculo (código é case-sensitive)', faceData: null, faceImageUrl: 'Data:image/jpeg;base64,xx', esperado: false },
      { nome: 'hash legado + data URL legado', faceData: hashLegado, faceImageUrl: FACE_URL, esperado: true },
      { nome: 'cifrado corrompido + data URL legado', faceData: corrompida, faceImageUrl: FACE_URL, esperado: true }
    ]

    const now = new Date()
    const ev = await prisma.event.create({
      data: {
        name: `PRESENCA ${SUF}`, slug: `presenca-${SUF}`, code: `PRE-${SUF}`,
        startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)

    const ids: string[] = []
    for (const [i, c] of casos.entries()) {
      const p = await prisma.participant.create({
        data: {
          eventId: ev.id, name: `PRES ${SUF} ${i}`, cpf: `6${SUF}${String(i).padStart(4, '0')}`.slice(-11),
          status: 'active', isDeleted: false, approvalStatus: 'approved',
          employeeNo: `${SUF}${String(i).padStart(2, '0')}`, // 8 dígitos; 99 reservado abaixo
          faceData: c.faceData, faceImageUrl: c.faceImageUrl
        }
      })
      created.participants.push(p.id)
      ids.push(p.id)
    }

    console.log('\n=== 1) SQL x código, caso a caso ===')
    const sql = await idsComFoto(ids)
    for (const [i, c] of casos.entries()) {
      const codigo = temFotoPeloCodigo({ faceData: c.faceData, faceImageUrl: c.faceImageUrl })
      const banco = sql.has(ids[i])
      check(`${c.nome}: código=${codigo} sql=${banco} (esperado ${c.esperado})`, codigo === c.esperado && banco === c.esperado)
    }

    console.log('\n=== 2) idsComFotoNoEvento aplica o mesmo recorte da reconciliação ===')
    const semEmp = await prisma.participant.create({
      data: {
        eventId: ev.id, name: `PRES ${SUF} sem-emp`, cpf: `5${SUF}0000`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved', faceData: cifrada
      }
    })
    created.participants.push(semEmp.id)
    const apagado = await prisma.participant.create({
      data: {
        eventId: ev.id, name: `PRES ${SUF} apagado`, cpf: `5${SUF}0001`.slice(-11),
        status: 'active', isDeleted: true, approvalStatus: 'approved',
        employeeNo: `${SUF}99`, faceData: cifrada
      }
    })
    created.participants.push(apagado.id)
    const noEvento = await idsComFotoNoEvento(ev.id)
    const esperadosNoEvento = ids.filter((_, i) => casos[i].esperado)
    check('traz exatamente os com foto', noEvento.size === esperadosNoEvento.length && esperadosNoEvento.every(id => noEvento.has(id)), { veio: noEvento.size, esperado: esperadosNoEvento.length })
    check('fora: sem employeeNo', !noEvento.has(semEmp.id))
    check('fora: isDeleted', !noEvento.has(apagado.id))

    console.log('\n=== 3) reconcileTerminal decide pela presença ===')
    const term = await prisma.terminal.create({
      data: { name: `PRESENCA ${SUF}`, ipAddress: `10.96.${SUF.slice(-2)}.${SUF.slice(-4, -2)}`, isActive: true, passwordEncrypted: encryptString('x') }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000)
    })
    const idx = (nome: string) => casos.findIndex(c => c.nome === nome)
    const empDe = async (i: number) => (await prisma.participant.findUnique({ where: { id: ids[i] }, select: { employeeNo: true } }))!.employeeNo!
    const empValida = await empDe(idx('faceData cifrado válido'))
    const empHash = await empDe(idx('hash SHA-256 legado sozinho'))

    // Device tem: a foto válida e o hash legado (que não é foto). Falta todo o resto.
    const r = await reconcileTerminal(term.id, [
      { employeeNo: empValida, numOfFace: 1, numOfCard: 0 },
      { employeeNo: empHash, numOfFace: 1, numOfCard: 0 }
    ])
    check('hash legado no device vira órfão (não é desejado)', r.removeEmployeeNos.includes(empHash), r.removeEmployeeNos)
    check('foto válida no device NÃO vira órfão', !r.removeEmployeeNos.includes(empValida))
    const linhaLegado = await prisma.participantTerminalSync.findFirst({ where: { terminalId: term.id, participantId: ids[idx('legado data URL em faceImageUrl')] } })
    check('legado em faceImageUrl ausente do device → push de face', linhaLegado?.faceState === 'pending', linhaLegado?.faceState)
    const linhaSemFoto = await prisma.participantTerminalSync.findFirst({ where: { terminalId: term.id, participantId: ids[idx('sem foto nenhuma')] } })
    check('sem foto → nenhuma linha criada', linhaSemFoto === null)
    const esperadosPush = casos.filter(c => c.esperado).length - 1 // menos a válida, que já está no device
    check(`pushes = ${esperadosPush} (todos com foto, exceto o que já está no device)`, r.pushesEnqueued === esperadosPush, r.pushesEnqueued)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    await prisma.participantTerminalSync.deleteMany({ where: { participantId: { in: created.participants } } }).catch(() => {})
    await prisma.terminalEvent.deleteMany({ where: { terminalId: { in: created.terminals } } }).catch(() => {})
    await prisma.participant.deleteMany({ where: { id: { in: created.participants } } }).catch(() => {})
    await prisma.terminal.deleteMany({ where: { id: { in: created.terminals } } }).catch(() => {})
    await prisma.event.deleteMany({ where: { id: { in: created.events } } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().then(() => process.exit(failures === 0 ? 0 : 1)).catch(e => {
  console.error('ERRO:', e?.message)
  process.exit(1)
})
