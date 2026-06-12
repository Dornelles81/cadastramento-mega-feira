/**
 * Acesso unificado à imagem facial do participante.
 *
 * Formato novo (seguro): imagem criptografada AES-256-GCM em `faceData`,
 * `faceImageUrl` fica null.
 * Formato legado: data URL base64 em plaintext em `faceImageUrl`
 * (migrar com scripts/encrypt-legacy-faces.ts).
 */
import { decryptToString, isEncryptedPayload } from './crypto'

export interface ParticipantFaceFields {
  faceData?: Buffer | Uint8Array | null
  faceImageUrl?: string | null
}

/**
 * Retorna a imagem facial como data URL (decriptando se necessário) ou null.
 * Uso exclusivo em contexto autenticado/server-side.
 */
export function getFaceImageDataUrl(p: ParticipantFaceFields): string | null {
  if (p.faceData) {
    const buf = Buffer.isBuffer(p.faceData) ? p.faceData : Buffer.from(p.faceData)
    if (isEncryptedPayload(buf)) {
      try {
        const plain = decryptToString(buf)
        if (plain.startsWith('data:')) return plain
      } catch {
        // payload corrompido ou chave trocada — cai para o legado abaixo
      }
    }
  }

  // Legado: base64 plaintext na coluna faceImageUrl
  if (p.faceImageUrl && p.faceImageUrl.startsWith('data:')) {
    return p.faceImageUrl
  }
  if (p.faceImageUrl && /^https?:\/\//.test(p.faceImageUrl)) {
    return p.faceImageUrl
  }

  return null
}

/** Indica se o participante tem alguma imagem facial armazenada. */
export function hasFaceImage(p: ParticipantFaceFields): boolean {
  return getFaceImageDataUrl(p) !== null
}
