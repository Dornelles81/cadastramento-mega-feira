/**
 * Teste do SILÊNCIO na descriptografia (sem device, sem dev server).
 *
 * Invariante sob teste: falha de chave GRITA. Nunca vira "0 participantes,
 * sucesso" — que é indistinguível de um sync legítimo sem trabalho a fazer.
 *
 * Cobre:
 *   1) sem faceData → null (ausência de foto é legítima, não é erro)
 *   2) faceData presente + chave errada → LANÇA (não retorna null)
 *   3) faceData ilegível + legado utilizável → devolve o legado (sem lançar)
 *   4) preflight com chave errada → CryptoPreflightError
 *   5) script REAL com MASTER_KEY errada → sai com erro e diz o porquê
 *   6) zero elegíveis com chave CERTA → também sai com erro (zero é suspeito)
 *
 * Uso: node_modules/.bin/tsx scripts/test-crypto-silence.ts
 * Cria e apaga seus próprios dados.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as path from 'path'
import { spawnSync } from 'child_process'
import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { FaceDecryptionError, getFaceImageDataUrl, tryGetFaceImageDataUrl } from '../lib/face-image'
import { assertFaceCryptoReady, CryptoPreflightError } from '../lib/crypto-preflight'
import { createAllocation } from '../lib/terminals/allocation'

const SUF = Date.now().toString().slice(-6)
const SCRIPT = path.resolve(__dirname, 'sync-faces-device.ts')
const CHAVE_CERTA = process.env.MASTER_KEY!
const CHAVE_ERRADA = 'x'.repeat(48) // presente e com tamanho válido, porém ERRADA

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

function runScript(args: string[], env: Record<string, string> = {}) {
  const tsxCli = require.resolve('tsx/cli')
  const r = spawnSync(process.execPath, [tsxCli, SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    timeout: 120000,
    env: { ...process.env, ...env }
  })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Executa fn com a MASTER_KEY trocada, restaurando sempre. */
function comChave<T>(chave: string, fn: () => T): T {
  const antes = process.env.MASTER_KEY
  process.env.MASTER_KEY = chave
  try { return fn() } finally { process.env.MASTER_KEY = antes }
}

async function main() {
  const created: { events: string[]; participants: string[]; terminals: string[] } = { events: [], participants: [], terminals: [] }

  try {
    const now = new Date()
    const FACE_URL = 'data:image/jpeg;base64,/9j/4AAQ-FAKE-' + SUF
    const cifrada = encryptString(FACE_URL)

    console.log('\n=== 1) sem faceData: null é legítimo ===')
    const semFoto = getFaceImageDataUrl({ faceData: null, faceImageUrl: null })
    check('retorna null, sem lançar', semFoto === null)

    console.log('\n=== 2) faceData presente + chave ERRADA: tem que lançar ===')
    const comChaveCerta = getFaceImageDataUrl({ faceData: cifrada, faceImageUrl: null })
    check('com a chave certa, decripta normalmente', comChaveCerta === FACE_URL)

    let erro: any = null
    let retorno: any = 'NAO-EXECUTOU'
    comChave(CHAVE_ERRADA, () => {
      try { retorno = getFaceImageDataUrl({ faceData: cifrada, faceImageUrl: null }) }
      catch (e) { erro = e }
    })
    check('LANÇOU (não retornou null silenciosamente)', erro !== null, retorno)
    check('é FaceDecryptionError', erro instanceof FaceDecryptionError, erro?.name)
    check('mensagem aponta a MASTER_KEY', /MASTER_KEY/i.test(erro?.message ?? ''), erro?.message?.slice(0, 90))
    check('NÃO retornou null', retorno === 'NAO-EXECUTOU')

    console.log('\n=== 3) ilegível + legado utilizável: usa o legado, sem lançar ===')
    let comLegado: any = null
    let erroLegado: any = null
    comChave(CHAVE_ERRADA, () => {
      try { comLegado = getFaceImageDataUrl({ faceData: cifrada, faceImageUrl: FACE_URL }) }
      catch (e) { erroLegado = e }
    })
    check('devolveu a foto legada', comLegado === FACE_URL, erroLegado?.message)
    check('não lançou (a foto existe e é utilizável)', erroLegado === null)

    console.log('\n=== 4) preflight com chave errada ===')
    let erroPre: any = null
    const antes = process.env.MASTER_KEY
    process.env.MASTER_KEY = CHAVE_ERRADA
    try { await assertFaceCryptoReady() } catch (e) { erroPre = e } finally { process.env.MASTER_KEY = antes }
    check('lançou CryptoPreflightError', erroPre instanceof CryptoPreflightError, erroPre?.name)
    check('mensagem explica que o sync foi abortado', /abortado|NÃO abre/i.test(erroPre?.message ?? ''), erroPre?.message?.slice(0, 100))

    let erroVazia: any = null
    process.env.MASTER_KEY = ''
    try { await assertFaceCryptoReady() } catch (e) { erroVazia = e } finally { process.env.MASTER_KEY = antes }
    check('chave ausente também é barrada', erroVazia instanceof CryptoPreflightError)

    check('preflight passa com a chave certa', (await assertFaceCryptoReady()).ok === true)

    // Fixtures para os testes de ponta a ponta
    const ev = await prisma.event.create({
      data: {
        name: `SILENCIO ${SUF}`, slug: `silencio-${SUF}`, code: `SIL-${SUF}`,
        startDate: now, endDate: new Date(now.getTime() + 86400000), requiresApprovalForAccess: true
      }
    })
    created.events.push(ev.id)
    const TEST_IP = `10.97.${SUF.slice(-2)}.${SUF.slice(-4, -2)}`
    const term = await prisma.terminal.create({
      data: { name: `SILENCIO ${SUF}`, ipAddress: TEST_IP, isActive: true, passwordEncrypted: encryptString('x'), fdid: '1' }
    })
    created.terminals.push(term.id)
    await createAllocation({
      terminalId: term.id, eventId: ev.id,
      startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000)
    })
    const p = await prisma.participant.create({
      data: {
        eventId: ev.id, name: `SILENCIO P ${SUF}`, cpf: `7${SUF}0001`.slice(-11),
        status: 'active', isDeleted: false, approvalStatus: 'approved',
        employeeNo: `75${SUF}1`.slice(-8), faceData: cifrada
      }
    })
    created.participants.push(p.id)

    console.log('\n=== 5) script REAL com MASTER_KEY errada ===')
    const errado = runScript([`--all`, `--ip=${TEST_IP}`, '--dry-run'], { MASTER_KEY: CHAVE_ERRADA })
    check('saiu com código de erro', errado.status !== 0, errado.status)
    check('acusou a MASTER_KEY', /MASTER_KEY/i.test(errado.out))
    check('NÃO disse "0 participantes" como se fosse normal', !/Nenhum participante elegível/.test(errado.out))
    check('NÃO imprimiu relatório de sucesso', !/✅ Sucessos       : 0/.test(errado.out))

    console.log('\n=== 6) zero elegíveis com a chave CERTA também é erro ===')
    // Torna o único participante inelegível: sobra zero, sem problema de chave.
    await prisma.participant.update({ where: { id: p.id }, data: { approvalStatus: 'pending' } })
    const zero = runScript([`--all`, `--ip=${TEST_IP}`, '--dry-run'])
    check('saiu com código de erro', zero.status === 1, zero.status)
    check('disse que zero é suspeito', /ZERO participantes elegíveis/.test(zero.out))
    check('o preflight passou (não confundiu com chave)', /MASTER_KEY validada/.test(zero.out))

    console.log('\n=== 7) variante tolerante: degrada na tela, grita no log ===')
    const capturado: string[] = []
    const errOriginal = console.error
    console.error = (...a: any[]) => { capturado.push(a.join(' ')) }
    let toleranteRetorno: string | null = 'NAO-EXECUTOU' as any
    try {
      comChave(CHAVE_ERRADA, () => {
        toleranteRetorno = tryGetFaceImageDataUrl(
          { faceData: cifrada, faceImageUrl: null },
          { participantId: p.id, where: 'teste' }
        )
      })
    } finally {
      console.error = errOriginal
    }
    check('retornou null (não derrubou a chamada)', toleranteRetorno === null, toleranteRetorno)
    check('logou a falha', capturado.length === 1, capturado.length)
    check('log traz o participantId — dá para achar a linha corrompida', capturado[0]?.includes(p.id), capturado[0]?.slice(0, 110))
    check('log identifica o local da chamada', capturado[0]?.includes('teste'))

    const capturado2: string[] = []
    console.error = (...a: any[]) => { capturado2.push(a.join(' ')) }
    let semFotoTolerante: string | null = 'X' as any
    try {
      semFotoTolerante = tryGetFaceImageDataUrl({ faceData: null, faceImageUrl: null }, { where: 'teste' })
    } finally {
      console.error = errOriginal
    }
    check('ausência de foto NÃO gera log (só falha real gera)', semFotoTolerante === null && capturado2.length === 0, capturado2)

    console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
  } finally {
    process.env.MASTER_KEY = CHAVE_CERTA
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
