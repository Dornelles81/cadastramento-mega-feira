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

// ── Limiares de POSE (yaw/pitch/roll) — CALIBRADOS na FASE B, ainda NÃO aplicados ──
// A Fase C é que liga estes limiares ao gate de captura. Hoje só alimentam o
// cálculo/overlay de debug (?debugPose=1).
//   • roll é GRAU real (barato, do eixo dos olhos) → limiar em graus.
//   • yaw/pitch são RAZÕES normalizadas pela interocular (recomendação 2b:
//     calibrar razão, NÃO converter para grau).
// Valores CALIBRADOS no PC (Fase B, fotos de ângulo conhecido via ?debugPose=1),
// inclinados de propósito para o PERMISSIVO (não travar o balcão) — a APERTAR na
// Fase D com o terminal Hikvision real. Dados brutos da calibração na memória
// deteccao-pose-facial.md. ⚠ AINDA NÃO aplicados ao gate.
//   yaw:   0.401 ainda aceitável · 0.682 já ruim · 10.49 perfil → corte 0.45
//   pitch: pose extrema chega só a ~0.19 (BAIXA sensibilidade do pitch coarse;
//          o placeholder 0.30 nunca dispararia — estava quebrado) → corte 0.15
//   roll:  −11.6° aceitável · −36.3° ruim (bate com referência da indústria) → 15°
export const ROLL_MAX_DEG = 15      // inclinação (tilt) máx, em GRAUS — calibrado Fase B
export const YAW_MAX_RATIO = 0.45   // RAZÃO (offset/interocular) — calibrado Fase B
export const PITCH_MAX_RATIO = 0.15 // RAZÃO (offset/interocular) — calibrado Fase B (eixo frágil)

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
