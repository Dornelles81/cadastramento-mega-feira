/**
 * Combinador do gate de captura (FASE C0 — PURO, ainda NÃO ligado à UI).
 *
 * Junta, numa ÚNICA decisão priorizada, as três camadas do gate:
 *   1. DISTÂNCIA (já pronta em detector.ts: `decideFromReads`/`nextGateState`) —
 *      passada aqui como `distanceReason`, NUNCA recalculada.
 *   2. ENQUADRAMENTO (bbox) — rosto centrado e não-cortado.
 *   3. POSE (yaw/roll; pitch FORA por ora — eixo frágil, reativa na Fase D) —
 *      via `decidePose` (histerese própria), consumindo os limiares de status.ts.
 *
 * REGRA DE OURO (isolamento anti-regressão): a distância é a dona do veredito. Se
 * `distanceReason !== 'ok'`, retorna-o DIRETO — pose/enquadramento nem são
 * avaliados. Esta função só transforma um 'ok' de distância em OUTRO bloqueio;
 * nunca o contrário.
 *
 * DEGRADAÇÃO SEGURA: `bbox`/dimensões ausentes → pula enquadramento; `pose`
 * ausente → pula pose. Sem esses dados, cai no comportamento de distância de hoje
 * (nunca trava por falta de dado).
 *
 * ORDEM (um blocker por vez): noFace → tooSmall → cutOff → offCenter → tilt → turn → ok
 */
import type { FaceReason } from './detector'
import { decidePose, DEFAULT_POSE_THRESHOLDS, type Pose } from './pose'

export type CaptureReason =
  | 'noFace'
  | 'tooSmall'
  | 'cutOff'
  | 'offCenter'
  | 'tilt'
  | 'turnLeft'
  | 'turnRight'
  | 'ok'
// (sem 'chinUp'/'chinDown' por ora — pitch está FORA do gate na Fase C)

export interface FramingThresholds {
  /** Alvo do centro do rosto (fração 0–1). centerY=0.45 casa com o oval-guia. */
  centerX: number
  centerY: number
  /** Tolerância do desvio do centro (fração da largura/altura do frame). */
  tolX: number
  tolY: number
  /** Margem mínima livre em cada borda (fração) — abaixo disso = cortado. */
  margin: number
  /** Faixa morta (histerese) aplicada a tol* e margin. */
  hyst: number
}

/**
 * PLACEHOLDER PERMISSIVO — a CALIBRAR na fatia C2-a (instrumentar bbox/centro no
 * overlay, medir casos reais, e então FIXAR estes valores em status.ts como fonte
 * única). NÃO são chutes definitivos; existem só para o combinador ser testável.
 * INVARIANTE: `hyst` < `margin` e `hyst` < `tol*` (senão o limiar de ENTRAR no
 * bloqueio fica negativo/inalcançável).
 */
export const DEFAULT_FRAMING_THRESHOLDS: FramingThresholds = {
  centerX: 0.5,
  centerY: 0.45,
  tolX: 0.18,
  tolY: 0.18,
  margin: 0.04,
  hyst: 0.02
}

export interface CaptureInput {
  /** Veredito da camada de DISTÂNCIA (de decideFromReads/nextGateState). */
  distanceReason: FaceReason
  /** bbox do rosto em PIXELS do frame ≤800 (de FaceMeasurement). */
  bbox?: { x: number; y: number; w: number; h: number }
  /** Dimensões do frame medido (px). Necessárias p/ o enquadramento. */
  frameW?: number
  frameH?: number
  /** Pose calculada (computePose). null/ausente = pula a camada de pose. */
  pose?: Pose | null
  /** Limiares de enquadramento (default = DEFAULT_FRAMING_THRESHOLDS). */
  framing?: FramingThresholds
  /**
   * VÁLVULA reservada (achado MIRROR): true quando o espaço MEDIDO ≠ o espaço
   * EXIBIDO. Hoje é SEMPRE false — em todos os caminhos o frame é medido no mesmo
   * espaço em que é exibido (PC: ambos espelhados; upload: ambos sem espelho), e a
   * mensagem de direção é NEUTRA ("vire o rosto pra frente"), então não há flip a
   * fazer. Mantido documentado para caso o preview mude no futuro. NÃO consumido.
   */
  mirrored?: boolean
}

/** Enquadramento: 'cutOff' | 'offCenter' | 'ok'; null = sem dados (pula). */
function evalFraming(input: CaptureInput, prev: CaptureReason): 'cutOff' | 'offCenter' | 'ok' | null {
  const { bbox, frameW, frameH } = input
  if (!bbox || !frameW || !frameH) return null // degradação segura
  const t = input.framing ?? DEFAULT_FRAMING_THRESHOLDS

  // CORTADO: alguma borda com folga abaixo da margem exigida. Histerese: quando já
  // estava cortado, exige PUXAR mais pra dentro pra limpar (margem maior).
  const wasCut = prev === 'cutOff'
  const reqMargin = t.margin + (wasCut ? t.hyst : -t.hyst)
  const insetL = bbox.x / frameW
  const insetT = bbox.y / frameH
  const insetR = (frameW - (bbox.x + bbox.w)) / frameW
  const insetB = (frameH - (bbox.y + bbox.h)) / frameH
  if (insetL < reqMargin || insetT < reqMargin || insetR < reqMargin || insetB < reqMargin) {
    return 'cutOff'
  }

  // DESCENTRADO: centro do rosto longe do alvo. Histerese: quando já estava
  // descentrado, exige ficar mais perto do centro pra limpar (tolerância menor).
  const wasOff = prev === 'offCenter'
  const tolX = t.tolX + (wasOff ? -t.hyst : t.hyst)
  const tolY = t.tolY + (wasOff ? -t.hyst : t.hyst)
  const cx = (bbox.x + bbox.w / 2) / frameW
  const cy = (bbox.y + bbox.h / 2) / frameH
  if (Math.abs(cx - t.centerX) > tolX || Math.abs(cy - t.centerY) > tolY) {
    return 'offCenter'
  }

  return 'ok'
}

/**
 * Decide o gate de captura combinado. `prev` = CaptureReason do frame anterior
 * (default 'ok'), usado para a histerese de pose (via decidePose) e de
 * enquadramento. Ver REGRA DE OURO e ORDEM no topo do arquivo.
 */
export function decideCapture(input: CaptureInput, prev: CaptureReason = 'ok'): CaptureReason {
  // 1–2) DISTÂNCIA manda. Se não é ok, retorna direto (não avalia o resto).
  if (input.distanceReason === 'noFace') return 'noFace'
  if (input.distanceReason === 'tooSmall') return 'tooSmall'
  // input.distanceReason === 'ok' daqui pra baixo.

  // 3) ENQUADRAMENTO (cutOff antes de offCenter). null = sem dados → pula.
  const framing = evalFraming(input, prev)
  if (framing === 'cutOff') return 'cutOff'
  if (framing === 'offCenter') return 'offCenter'

  // 4–5) POSE (tilt antes de turn; pitch FORA). Ausente → pula.
  if (input.pose) {
    // Dois cálculos com eixos isolados para respeitar a ORDEM (tilt→turn) mantendo
    // a HISTERESE de decidePose. pitch sempre desligado (pitchMax: Infinity).
    const wasTilt = prev === 'tilt'
    const wasTurn = prev === 'turnLeft' || prev === 'turnRight'

    // roll (tilt) isolado: yaw desligado
    const rollReason = decidePose(
      input.pose,
      { ...DEFAULT_POSE_THRESHOLDS, yawMax: Infinity, pitchMax: Infinity },
      wasTilt ? 'tilt' : 'ok'
    )
    if (rollReason === 'tilt') return 'tilt'

    // yaw (turn) isolado: roll desligado. A DIREÇÃO segue o sinal do yaw no espaço
    // MEDIDO (= espaço exibido hoje); a mensagem final é neutra na UI.
    const yawReason = decidePose(
      input.pose,
      { ...DEFAULT_POSE_THRESHOLDS, rollMaxDeg: Infinity, pitchMax: Infinity },
      wasTurn ? prev : 'ok'
    )
    if (yawReason === 'turnLeft') return 'turnLeft'
    if (yawReason === 'turnRight') return 'turnRight'
  }

  return 'ok'
}
