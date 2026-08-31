/**
 * Métricas do detector vindas do cliente, saneadas para persistência.
 *
 * O `faceData` do corpo da requisição é entrada NÃO CONFIÁVEL: vem do
 * navegador e pode chegar deformado, parcial ou hostil. Estas funções são o
 * único ponto onde ele vira coluna — os três endpoints que gravam face
 * (`stand-registration`, `register-fixed`, `participants/update`) chamam daqui
 * em vez de repetir a checagem, que era como as regras divergiam antes.
 *
 * Regra: campo que não chega no formato esperado vira `null`. Nunca um valor
 * "aproximado" — medição inventada é pior que medição ausente, porque não dá
 * para distinguir depois.
 */

import { Prisma } from '@prisma/client'

export interface FaceMetrics {
  faceBbox: { x: number; y: number; w: number; h: number } | null
  facePose: { yaw: number; pitch: number; roll: number } | null
  faceFrameW: number | null
  faceFrameH: number | null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const inteiroPositivo = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n > 0 ? Math.round(n) : null
}

/** Extrai bbox/pose/frame do `faceData` do cliente. Tudo opcional. */
export function extractFaceMetrics(faceData: any): FaceMetrics {
  const vazio: FaceMetrics = { faceBbox: null, facePose: null, faceFrameW: null, faceFrameH: null }
  if (!faceData || typeof faceData !== 'object') return vazio

  // bbox: só grava se os QUATRO números vierem. Meio bbox não serve para
  // avaliar enquadramento, e gravar pela metade viraria armadilha depois.
  let faceBbox: FaceMetrics['faceBbox'] = null
  const b = faceData.faceBbox
  if (b && typeof b === 'object') {
    const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h)
    if (x !== null && y !== null && w !== null && h !== null && w > 0 && h > 0) {
      faceBbox = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
    }
  }

  // pose: idem — os três eixos ou nada. yaw/pitch são razões, roll é grau.
  let facePose: FaceMetrics['facePose'] = null
  const p = faceData.facePose
  if (p && typeof p === 'object') {
    const yaw = num(p.yaw), pitch = num(p.pitch), roll = num(p.roll)
    if (yaw !== null && pitch !== null && roll !== null) {
      facePose = { yaw, pitch, roll }
    }
  }

  return {
    faceBbox,
    facePose,
    faceFrameW: inteiroPositivo(faceData.faceFrameW),
    faceFrameH: inteiroPositivo(faceData.faceFrameH)
  }
}

/**
 * O mesmo, no formato que o Prisma aceita para colunas `Json?`.
 *
 * `null` literal NÃO é válido ali: o Prisma exige `DbNull` (NULL na coluna) ou
 * `JsonNull` (o valor JSON `null`, que é coisa diferente). Usamos DbNull — a
 * ausência de medição é ausência de dado, não um JSON contendo null.
 *
 * Importa num update: passar DbNull APAGA a métrica da foto anterior, que é o
 * comportamento desejado quando chega uma foto nova sem medição. `undefined`
 * deixaria a métrica velha descrevendo a imagem nova.
 */
export function faceMetricsForPrisma(faceData: any) {
  const m = extractFaceMetrics(faceData)
  return {
    faceBbox: m.faceBbox ?? Prisma.DbNull,
    facePose: m.facePose ?? Prisma.DbNull,
    faceFrameW: m.faceFrameW,
    faceFrameH: m.faceFrameH
  }
}
