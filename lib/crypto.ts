/**
 * Criptografia de dados sensíveis (biometria, documentos)
 * AES-256-GCM com IV aleatório e tag de autenticação.
 *
 * Formato do payload: [versão(1)] [iv(12)] [authTag(16)] [ciphertext(n)]
 */
import crypto from 'crypto'

const FORMAT_VERSION = 1
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const masterKey = process.env.MASTER_KEY
  if (!masterKey || masterKey.length < 32) {
    throw new Error(
      'MASTER_KEY ausente ou com menos de 32 caracteres. ' +
        'Configure a variável de ambiente antes de processar dados biométricos.'
    )
  }
  // Deriva chave de 32 bytes a partir da MASTER_KEY
  return crypto.createHash('sha256').update(masterKey).digest()
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, tag, ciphertext])
}

export function decryptBuffer(payload: Buffer): Buffer {
  if (payload.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Payload criptografado inválido (muito curto)')
  }
  if (payload[0] !== FORMAT_VERSION) {
    throw new Error(`Versão de criptografia desconhecida: ${payload[0]}`)
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH)
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH)
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function encryptString(plain: string): Buffer {
  return encryptBuffer(Buffer.from(plain, 'utf8'))
}

export function decryptToString(payload: Buffer): string {
  return decryptBuffer(payload).toString('utf8')
}

/**
 * Verifica se um Buffer está no formato criptografado atual.
 * Útil durante a migração de dados legados (hash SHA-256 / plaintext).
 */
export function isEncryptedPayload(payload: Buffer | null | undefined): boolean {
  return (
    !!payload &&
    payload.length > 1 + IV_LENGTH + TAG_LENGTH &&
    payload[0] === FORMAT_VERSION
  )
}
