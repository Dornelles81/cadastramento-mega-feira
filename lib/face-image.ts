/**
 * Acesso unificado à imagem facial do participante.
 *
 * Formato novo (seguro): imagem criptografada AES-256-GCM em `faceData`,
 * `faceImageUrl` fica null.
 * Formato legado: data URL base64 em plaintext em `faceImageUrl`
 * (migrar com scripts/encrypt-legacy-faces.ts).
 *
 * CONTRATO DO RETORNO — a distinção importa:
 *   null   = o participante NÃO TEM foto. Estado legítimo.
 *   throw  = ele TEM `faceData`, mas não foi possível descriptografar.
 *
 * Antes esses dois casos colapsavam em `null`, e o resultado era silêncio: com
 * a MASTER_KEY errada, TODOS os participantes pareciam "sem foto" — a
 * elegibilidade os descartava e o sync reportava "0 participantes, sucesso"
 * em vez de gritar. Falha de chave é falha de configuração, não ausência de dado.
 */
import { decryptToString, isEncryptedPayload } from './crypto'

export interface ParticipantFaceFields {
  faceData?: Buffer | Uint8Array | null
  faceImageUrl?: string | null
}

/** Falha ao descriptografar biometria: MASTER_KEY errada/trocada ou payload corrompido. */
export class FaceDecryptionError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'FaceDecryptionError'
    this.cause = cause
  }
}

/**
 * Retorna a imagem facial como data URL (decriptando se necessário) ou null
 * quando não há foto. Lança `FaceDecryptionError` quando há `faceData`
 * criptografado que não pôde ser aberto e não existe legado utilizável.
 * Uso exclusivo em contexto autenticado/server-side.
 */
export function getFaceImageDataUrl(p: ParticipantFaceFields): string | null {
  let falha: FaceDecryptionError | null = null

  if (p.faceData) {
    const buf = Buffer.isBuffer(p.faceData) ? p.faceData : Buffer.from(p.faceData)
    if (isEncryptedPayload(buf)) {
      try {
        const plain = decryptToString(buf)
        if (plain.startsWith('data:')) return plain
        // Decriptou (tag GCM confere), mas o conteúdo não é imagem: dado
        // inesperado, não problema de chave. Ainda assim não pode virar null.
        falha = new FaceDecryptionError(
          'faceData descriptografado não é um data URL de imagem (payload inesperado)'
        )
      } catch (err) {
        falha = new FaceDecryptionError(
          'Falha ao descriptografar faceData: MASTER_KEY incorreta/trocada ou payload corrompido. ' +
            'O participante TEM biometria armazenada — tratá-lo como "sem foto" esconderia o erro.',
          err
        )
      }
    }
    // Buffer não-criptografado em faceData = legado (hash SHA-256): não é falha,
    // segue para o fallback abaixo.
  }

  // Legado: base64 plaintext na coluna faceImageUrl. Vale como fallback mesmo
  // quando o faceData falhou — a foto existe e é utilizável.
  if (p.faceImageUrl && p.faceImageUrl.startsWith('data:')) {
    return p.faceImageUrl
  }
  if (p.faceImageUrl && /^https?:\/\//.test(p.faceImageUrl)) {
    return p.faceImageUrl
  }

  if (falha) throw falha

  return null
}

/**
 * Variante TOLERANTE, para telas e listagens: uma biometria ilegível vira foto
 * ausente na interface em vez de derrubar a página inteira — mas NUNCA em
 * silêncio. A falha vai para o log com o `participantId`, que é o que permite
 * achar a linha corrompida depois.
 *
 * Use esta onde a foto é acessório da tela. Onde a foto É o produto (sync,
 * /api/agent/work, participant-image), use `getFaceImageDataUrl`: ali um erro
 * alto é o comportamento correto, porque entregar "sem foto" seria entregar
 * errado.
 */
export function tryGetFaceImageDataUrl(
  p: ParticipantFaceFields,
  ctx: { participantId?: string | null; where: string }
): string | null {
  try {
    return getFaceImageDataUrl(p)
  } catch (err) {
    if (err instanceof FaceDecryptionError) {
      console.error(
        `[face-image] ${ctx.where}: biometria ILEGÍVEL do participante ` +
          `${ctx.participantId ?? '(id desconhecido)'} — ${err.message}`
      )
      return null
    }
    throw err
  }
}

/** Indica se o participante tem alguma imagem facial armazenada. */
export function hasFaceImage(p: ParticipantFaceFields): boolean {
  return getFaceImageDataUrl(p) !== null
}
