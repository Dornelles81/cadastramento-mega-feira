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

// [A2] Teto de distância (interocular MÁXIMA): acima disso o rosto está perto/grande
// demais → "Afaste um pouco". Calibrado no celular (2026-07-06): bom~138, preenche o
// oval~167, ainda detecta até ~326, noFace acima de 326. 180 deixa passar até preencher
// o oval e avisa "afaste" MUITO antes do detector quebrar (326). Fonte única.
export const INTEROCULAR_MAX = 180

// ── Limiares de POSE (yaw/pitch/roll) — Fase B + APERTADOS ao vivo no C1 ──
// A Fase C liga estes limiares ao gate (via decideCapture → decidePose). yaw/pitch
// são RAZÕES (offset/interocular); roll é GRAU real (do eixo dos olhos).
//
// ⚠ HISTERESE (pose.ts DEFAULT_POSE_THRESHOLDS: hystRatio=0.05, hystDeg=3): o gate
// bloqueia (ok→vermelho) em BASE+hyst e só volta a 'ok' em BASE−hyst. Logo o
// bloqueio VISUAL acontece em base+hyst, NÃO na base. Por isso a base é fixada em
// (ALVO − hyst): assim o bloqueio efetivo cai no alvo calibrado e ainda sobra
// margem anti-flicker. A "zona pegajosa" de volta favorece foto frontal/nivelada.
//
// Recalibração C1 (ao vivo, PC): com base 0.45/15 a histerese empurrava o bloqueio
// pra ~0.50/18° (frouxo). No teste, 0.47 yaw já é PERFIL e 16° roll já fica torto.
//   yaw:  ALVO 0.30 → base 0.25 (bloqueia em 0.25+0.05=0.30; volta em 0.20)
//   roll: ALVO 13°  → base 10  (bloqueia em 10+3=13°; volta em 7°)
//   pitch: FORA do gate por ora (eixo frágil, ~0.19 máx) — reativa na Fase D
export const ROLL_MAX_DEG = 10      // base; bloqueio efetivo 13° (base+hystDeg) — C1
export const YAW_MAX_RATIO = 0.25   // base; bloqueio efetivo 0.30 (base+hystRatio) — C1
export const PITCH_MAX_RATIO = 0.15 // fora do gate na Fase C (reativa na Fase D)

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
