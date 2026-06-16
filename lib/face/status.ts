/**
 * Fonte de verdade ÚNICA do status de face, derivado da medição real
 * (Participant.faceInterocularPx). Função pura, SEM dependência de browser —
 * usável nos endpoints (server) e na UI. Substitui as três regras divergentes
 * antigas de hasValidFace (captureQuality>0.5, >0.7, !!faceImageUrl).
 *
 * Gate em 60px calibrado na bancada (Fatia 2): o terminal DS-K1T671M-L corta o
 * `pupilDistanceTooSmall` por volta dessa medida no MediaPipe (régua do detector
 * do cadastro), com margem sobre o ruído. Ver lib/face/detector.ts.
 */
export const MIN_INTEROCULAR_PX = 60

export type FaceStatus = 'unmeasured' | 'no_face' | 'too_small' | 'valid'

/**
 *   null → 'unmeasured' (legado: nunca passou pelo detector; NÃO é inválido)
 *   0    → 'no_face'    (medido, sem rosto detectável)
 *   <60  → 'too_small'  (rosto pequeno/distante; o terminal recusaria)
 *   ≥60  → 'valid'
 */
export function deriveFaceStatus(px: number | null | undefined): FaceStatus {
  if (px == null) return 'unmeasured'
  if (px === 0) return 'no_face'
  if (px < MIN_INTEROCULAR_PX) return 'too_small'
  return 'valid'
}

/** hasValidFace unificado: só 'valid' conta. 'unmeasured' (legado) NÃO é inválido. */
export function isValidFace(px: number | null | undefined): boolean {
  return deriveFaceStatus(px) === 'valid'
}

/** Rótulo PT para UI/exports. */
export function faceStatusLabel(px: number | null | undefined): string {
  switch (deriveFaceStatus(px)) {
    case 'valid': return 'Válida'
    case 'too_small': return 'Rosto pequeno'
    case 'no_face': return 'Sem rosto'
    default: return 'Não medida'
  }
}
