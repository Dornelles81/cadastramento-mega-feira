/**
 * Teto de TAMANHO da foto de rosto — FONTE ÚNICA (cliente e servidor).
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * O FDLib do terminal RECUSA foto grande demais, e recusa mal: devolve
 * `statusCode=6 Invalid Content subStatusCode=badJsonContent errorMsg=faceURL`,
 * que parece defeito do nosso multipart e não tem relação nenhuma com o
 * tamanho. Em 30/08/2026 isso custou seis dias de retry cego numa participante
 * (6.687 tentativas) até o corpo de erro do device chegar ao `lastError`.
 *
 * ── Por que 130 KB, e não os 200 KB da documentação ────────────────────────
 * 130 KB é MARGEM, medida contra o comportamento real dos dois DS-K1T673DX-BR
 * V3.18.0 do Ponto A:
 *   - 134,3 KB  → sincronizou (é o maior tamanho que sabemos que PASSA)
 *   - 201,2 KB  → falhou nos dois terminais, de forma determinística
 * O teto real, portanto, é MAIOR que 130 — este número é a margem de
 * segurança para cadastro NOVO, onde recomprimir não custa nada.
 *
 * ⚠️ NÃO use este teto como critério para reprocessar quem já está `synced`.
 * Uma foto de 134 KB já sincronizada está funcionando; recomprimi-la mudaria o
 * `faceVersion`, e isso derruba e recria o usuário no device — risco real, em
 * troca de conformidade com um número que é margem, não limite.
 *
 * ── Por que medir BYTES e não confiar na qualidade ─────────────────────────
 * A qualidade nominal do JPEG não é padronizada entre encoders. A captura já
 * pedia `toDataURL('image/jpeg', 0.6)` e ainda assim produziu 201 KB no
 * navegador do celular, onde o `sharp` produz 94 KB com o mesmo 0.6. Só o
 * tamanho em bytes decide.
 */

/** Teto de bytes do JPEG (não da data URL — ver `jpegBytesOfDataUrl`). */
export const FACE_MAX_BYTES = 130 * 1024

/**
 * Degraus de qualidade, do melhor para o pior. A busca para no PRIMEIRO que
 * couber: preservar qualidade importa para o reconhecimento facial, então não
 * comprimimos mais do que o necessário.
 */
export const FACE_QUALITY_STEPS = [0.6, 0.5, 0.42, 0.35] as const

/**
 * Bytes do JPEG dentro de uma data URL base64, SEM decodificar a imagem.
 * base64 carrega 3 bytes a cada 4 caracteres; o padding `=` no fim não é dado.
 */
export function jpegBytesOfDataUrl(dataUrl: string): number {
  const virgula = dataUrl.indexOf(',')
  const b64 = virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

export interface FaceSizeCheck {
  ok: boolean
  bytes: number
  limite: number
}

/** Barreira do SERVIDOR: a foto que chegou cabe no teto? */
export function checkFaceSize(dataUrl: string): FaceSizeCheck {
  const bytes = jpegBytesOfDataUrl(dataUrl)
  return { ok: bytes <= FACE_MAX_BYTES, bytes, limite: FACE_MAX_BYTES }
}

/** Mensagem única para o usuário quando nem o piso de qualidade coube. */
export const FACE_TOO_LARGE_MESSAGE =
  'A foto ficou grande demais para o terminal de acesso, mesmo após a compressão. ' +
  'Tire outra foto, de preferência com menos detalhe de fundo.'

export type CompressResult =
  | { ok: true; dataUrl: string; quality: number; bytes: number }
  | { ok: false; bytes: number; quality: number }

/**
 * Recomprime o canvas em degraus até caber no teto. **Nunca mexe na
 * resolução** — só requantiza. Resolução é o que o reconhecimento facial
 * precisa; peso é o que o device recusa. Reduzir pixels para ganhar bytes
 * trocaria um problema por outro pior.
 *
 * Devolve `ok:false` só quando NEM o piso couber — aí é caso de rejeitar e
 * pedir outra foto, não de degradar em silêncio.
 */
export function compressCanvasToLimit(
  canvas: HTMLCanvasElement,
  limite: number = FACE_MAX_BYTES
): CompressResult {
  let ultima = { dataUrl: '', bytes: Number.MAX_SAFE_INTEGER, quality: 0 }

  for (const quality of FACE_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const bytes = jpegBytesOfDataUrl(dataUrl)
    ultima = { dataUrl, bytes, quality }
    if (bytes <= limite) return { ok: true, dataUrl, quality, bytes }
  }

  return { ok: false, bytes: ultima.bytes, quality: ultima.quality }
}
