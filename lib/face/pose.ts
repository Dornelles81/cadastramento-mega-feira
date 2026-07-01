/**
 * Pose facial (yaw/pitch/roll) a partir dos 6 keypoints do MediaPipe FaceDetection.
 * Funções PURAS (sem browser) — testáveis sem câmera.
 *
 * FASE A: só CÁLCULO + display (overlay atrás de flag). O gate de captura AINDA
 * NÃO usa nada disto — a Fase C é que liga o guia ao vivo. A medição de distância
 * interocular (lib/face/status.ts + detector) fica intocada.
 *
 * Keypoints (em PIXELS na imagem de submissão ~800px), índices do FaceDetection:
 *   0 olho direito · 1 olho esquerdo · 2 nariz · 3 boca · 4 orelha dir · 5 orelha esq
 *
 * Normalização: yaw/pitch são RAZÕES (offset / interocular) — invariantes a escala
 * e CALIBRÁVEIS (recomendação 2b: calibrar razão, não converter para grau). roll é
 * GRAU real (do eixo dos olhos). Limiares máximos ficam em lib/face/status.ts.
 */
import { ROLL_MAX_DEG, YAW_MAX_RATIO, PITCH_MAX_RATIO } from './status'

export interface Keypoint { x: number; y: number }

export interface Pose {
  /** RAZÃO (noseX − eyeMidX)/interocular. ~0 frontal; sinal indica o lado. */
  yaw: number
  /** RAZÃO (noseY − eyeMidY)/interocular menos a baseline neutra. ~0 neutro. */
  pitch: number
  /** Desvio do eixo dos olhos em relação à horizontal, em GRAUS. ~0 frontal. */
  roll: number
}

export type PoseReason = 'ok' | 'turnLeft' | 'turnRight' | 'chinUp' | 'chinDown' | 'tilt'

/**
 * Num rosto frontal neutro o nariz fica ~0.6× a interocular abaixo da linha dos
 * olhos. Baseline de referência do pitch — calibrar na Fase B.
 */
export const PITCH_NEUTRAL_RATIO = 0.6

/** Calcula a pose a partir dos keypoints (px). null se faltar rosto/keypoints. */
export function computePose(kps?: Keypoint[] | null): Pose | null {
  if (!kps || kps.length < 3) return null
  const rEye = kps[0], lEye = kps[1], nose = kps[2]
  if (!rEye || !lEye || !nose) return null

  const dx = rEye.x - lEye.x
  const dy = rEye.y - lEye.y
  const interocular = Math.hypot(dx, dy)
  if (interocular < 1) return null

  const eyeMidX = (rEye.x + lEye.x) / 2
  const eyeMidY = (rEye.y + lEye.y) / 2

  const yaw = (nose.x - eyeMidX) / interocular
  const pitch = (nose.y - eyeMidY) / interocular - PITCH_NEUTRAL_RATIO
  // roll: desvio do eixo dos olhos da horizontal. atan2(dy, |dx|) dá ~0 na
  // horizontal independente da ordem esquerda/direita dos olhos (espelho selfie).
  const roll = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI

  return { yaw, pitch, roll }
}

export interface PoseThresholds {
  yawMax: number
  pitchMax: number
  rollMaxDeg: number
  /** Faixa morta (histerese) para razões e para graus. */
  hystRatio?: number
  hystDeg?: number
}

export const DEFAULT_POSE_THRESHOLDS: PoseThresholds = {
  yawMax: YAW_MAX_RATIO,
  pitchMax: PITCH_MAX_RATIO,
  rollMaxDeg: ROLL_MAX_DEG,
  hystRatio: 0.05,
  hystDeg: 3
}

/**
 * Decide se a pose está "frontal o suficiente", com HISTERESE (não tremular).
 * FASE A: definida e testável, mas AINDA NÃO usada pelo gate (Fase C liga).
 * Convenção de direção PROVISÓRIA (confirmar no overlay / Fase C, atenção ao
 * espelho do preview): yaw>0 → 'turnRight' · yaw<0 → 'turnLeft' ·
 * pitch>0 → 'chinDown' · pitch<0 → 'chinUp'.
 */
export function decidePose(
  pose: Pose,
  t: PoseThresholds = DEFAULT_POSE_THRESHOLDS,
  prev: PoseReason = 'ok'
): PoseReason {
  const hR = t.hystRatio ?? 0
  const hD = t.hystDeg ?? 0
  // Se já estava 'ok', tolera um pouco mais antes de sair; se estava fora, exige
  // entrar com folga.
  const relax = prev === 'ok'
  const yawMax = t.yawMax + (relax ? hR : -hR)
  const pitchMax = t.pitchMax + (relax ? hR : -hR)
  const rollMax = t.rollMaxDeg + (relax ? hD : -hD)

  // Exceedância relativa por eixo (quão além do limite) — reporta a pior.
  const exc: { reason: PoseReason; over: number }[] = []
  if (Math.abs(pose.yaw) > yawMax) exc.push({ reason: pose.yaw > 0 ? 'turnRight' : 'turnLeft', over: Math.abs(pose.yaw) / t.yawMax })
  if (Math.abs(pose.pitch) > pitchMax) exc.push({ reason: pose.pitch > 0 ? 'chinDown' : 'chinUp', over: Math.abs(pose.pitch) / t.pitchMax })
  if (Math.abs(pose.roll) > rollMax) exc.push({ reason: 'tilt', over: Math.abs(pose.roll) / t.rollMaxDeg })

  if (!exc.length) return 'ok'
  exc.sort((a, b) => b.over - a.over)
  return exc[0].reason
}
