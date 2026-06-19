/**
 * Testes da criptografia de documentos (sem DB). Cobre:
 *  - round-trip (cifra → decifra → original)
 *  - idempotência (cifrar 2x não re-cifra; merge do update preservado)
 *  - tolerância a legado (data: passa adiante; misto sai todo em claro)
 *  - fail-soft (cifrado corrompido → branca o blob, não derruba)
 *  - metadados preservados (fileName/timestamp intactos)
 *  - contadores da migração
 * Requer MASTER_KEY (mesma chave da face) — carrega de .env.local.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import {
  encryptDocuments, decryptDocuments, countPlaintextDocs, hasPlaintextDocs,
} from '../lib/documents'

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

const RG = 'data:image/jpeg;base64,/9j/4AAQSkZJRRGgABC=='
const NR35 = 'data:application/pdf;base64,JVBERi0xLjQK7777=='

const docs = () => ({
  rg: { documentType: 'rg', imageData: RG, fileName: 'rg.jpg', fileSize: 1234, timestamp: '2026-06-19T10:00:00Z' },
  nr35: { documentType: 'nr35', imageData: NR35, fileName: 'nr35.pdf', timestamp: '2026-06-19T10:01:00Z' },
})

console.log('=== 1) round-trip ===')
const enc = encryptDocuments(docs())
check('rg cifrado não começa com data:', !String(enc.rg.imageData).startsWith('data:'))
check('rg cifrado é base64 puro (sem ":")', !String(enc.rg.imageData).includes(':'))
check('nr35 cifrado também', !String(enc.nr35.imageData).startsWith('data:'))
const dec = decryptDocuments(enc)
check('rg decifrado == original', dec.rg.imageData === RG)
check('nr35 decifrado == original', dec.nr35.imageData === NR35)

console.log('\n=== 2) metadados preservados ===')
check('fileName intacto após cifrar', enc.rg.fileName === 'rg.jpg')
check('timestamp intacto após cifrar', enc.rg.timestamp === '2026-06-19T10:00:00Z')
check('documentType intacto após decifrar', dec.nr35.documentType === 'nr35')

console.log('\n=== 3) idempotência (cifrar 2x não re-cifra) ===')
const enc2 = encryptDocuments(enc)
check('2ª cifra == 1ª (não muda)', enc2.rg.imageData === enc.rg.imageData)
check('decifra após 2 cifras == original', decryptDocuments(enc2).rg.imageData === RG)

console.log('\n=== 4) merge do update ({...existentes cifrados, ...novos em claro}) ===')
const merged = { ...enc, novo: { documentType: 'comprovante', imageData: RG, fileName: 'comp.jpg' } }
const mergedEnc = encryptDocuments(merged)
check('existente (já cifrado) NÃO re-cifra', mergedEnc.rg.imageData === enc.rg.imageData)
check('novo (em claro) é cifrado', !String(mergedEnc.novo.imageData).startsWith('data:'))
const mergedDec = decryptDocuments(mergedEnc)
check('merge: todos saem em claro corretos', mergedDec.rg.imageData === RG && mergedDec.novo.imageData === RG)

console.log('\n=== 5) tolerância a legado (em claro passa adiante) ===')
const legacy = docs() // tudo data:
check('decifrar legado em claro = no-op', decryptDocuments(legacy).rg.imageData === RG)
const mixed = { rg: enc.rg, nr35: legacy.nr35 } // 1 cifrado + 1 legado
const mixedDec = decryptDocuments(mixed)
check('misto: cifrado decifra, legado mantém — ambos em claro', mixedDec.rg.imageData === RG && mixedDec.nr35.imageData === NR35)

console.log('\n=== 6) fail-soft (cifrado corrompido) ===')
const corrupt = { rg: { documentType: 'rg', imageData: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]).toString('base64'), fileName: 'x.jpg' } }
let threw = false
let cd: any
try { cd = decryptDocuments(corrupt) } catch { threw = true }
check('não lança exceção (não derruba a lista)', !threw)
check('blob corrompido vira null + flag', cd?.rg?.imageData === null && cd?.rg?._decryptError === true)
check('metadado do corrompido preservado', cd?.rg?.fileName === 'x.jpg')

console.log('\n=== 7) contadores da migração ===')
check('countPlaintextDocs(legado) = 2', countPlaintextDocs(legacy) === 2, countPlaintextDocs(legacy))
check('countPlaintextDocs(cifrado) = 0', countPlaintextDocs(enc) === 0)
check('countPlaintextDocs(misto) = 1', countPlaintextDocs(mixed) === 1)
check('hasPlaintextDocs(cifrado) = false', hasPlaintextDocs(enc) === false)
check('hasPlaintextDocs(null/{}) = false', hasPlaintextDocs(null) === false && hasPlaintextDocs({}) === false)

console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
process.exit(failures === 0 ? 0 : 1)
