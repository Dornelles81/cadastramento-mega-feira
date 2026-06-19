/**
 * Criptografia dos documentos do participante (RG, certificados NR, etc.) em
 * repouso — mesma AES-256-GCM da face ([[lib/crypto]]).
 *
 * `participant.documents` é um JSON `{ [tipo]: { imageData, fileName, ... } }`.
 * Ciframos APENAS o `imageData` (o blob sensível, um data URL base64),
 * preservando os metadados (fileName/timestamp) legíveis — úteis para futuros
 * gates ("quais documentType vieram?") sem precisar decriptar.
 *
 * Formato em repouso do `imageData` cifrado: base64 do payload binário do
 * crypto ([versão|iv|tag|ciphertext]). Não cabe Buffer em coluna JSON, por isso
 * base64-string.
 *
 * Discriminador legado×cifrado (100% confiável): um documento em claro é SEMPRE
 * um data URL e começa com `data:`; o base64 do ciphertext NUNCA contém `:`.
 * Logo `imageData.startsWith('data:')` distingue sem ambiguidade — base para a
 * estratégia "deploy tolerante primeiro, migração depois".
 */
import { encryptString, decryptToString, isEncryptedPayload } from './crypto'

type DocEntry = { imageData?: unknown; [k: string]: unknown }
type Documents = Record<string, unknown>

/** Um data URL em claro (documento legado, ainda não cifrado). */
function isPlaintextImageData(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:')
}

function mapEntries(documents: any, fn: (entry: any, key: string) => any): any {
  if (!documents || typeof documents !== 'object' || Array.isArray(documents)) return documents
  const out: Documents = {}
  for (const [key, val] of Object.entries(documents)) out[key] = fn(val, key)
  return out
}

/**
 * Cifra o `imageData` de cada documento que ainda esteja em claro (`data:`).
 * IDEMPOTENTE: o que já está cifrado é deixado intacto — por isso é seguro no
 * merge do update (`{...existentes, ...novos}`): existentes não re-cifram.
 */
export function encryptDocuments(documents: any): any {
  return mapEntries(documents, (entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const img = (entry as DocEntry).imageData
    if (isPlaintextImageData(img)) {
      return { ...entry, imageData: encryptString(img).toString('base64') }
    }
    return entry // já cifrado ou sem imageData
  })
}

/**
 * Decifra o `imageData` de cada documento cifrado. TOLERANTE A LEGADO:
 *  - data URL (`data:`) → passa adiante (legado em claro);
 *  - base64 no formato do crypto → decifra;
 *  - outra coisa → deixa como está (defensivo);
 *  - falha ao decifrar → BRANCA aquele imageData (+ flag) e segue, nunca derruba
 *    a lista inteira.
 */
export function decryptDocuments(documents: any): any {
  return mapEntries(documents, (entry, key) => {
    if (!entry || typeof entry !== 'object') return entry
    const img = (entry as DocEntry).imageData
    if (typeof img !== 'string' || img.length === 0) return entry
    if (img.startsWith('data:')) return entry // legado em claro
    const buf = Buffer.from(img, 'base64')
    if (!isEncryptedPayload(buf)) return entry // não é nosso formato → não mexe
    try {
      return { ...entry, imageData: decryptToString(buf) }
    } catch (e: any) {
      console.error(`[documents] falha ao decriptar "${key}":`, e?.message)
      return { ...entry, imageData: null, _decryptError: true }
    }
  })
}

/** Quantos documentos deste participante ainda estão em claro (para a migração). */
export function countPlaintextDocs(documents: any): number {
  if (!documents || typeof documents !== 'object' || Array.isArray(documents)) return 0
  let n = 0
  for (const val of Object.values(documents)) {
    if (val && typeof val === 'object' && isPlaintextImageData((val as DocEntry).imageData)) n++
  }
  return n
}

/** True se há ao menos um documento em claro (migração precisa tocar). */
export function hasPlaintextDocs(documents: any): boolean {
  return countPlaintextDocs(documents) > 0
}
