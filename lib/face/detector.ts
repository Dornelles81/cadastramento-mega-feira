/**
 * Detector de rosto client-side (MediaPipe FaceDetection), usado no momento da
 * captura para espelhar o gate do terminal e barrar foto que falharia no sync
 * (sem rosto / rosto pequeno). Roda 100% no browser.
 *
 * WASM/modelo servidos LOCALMENTE pela própria app (`/mediapipe/face_detection/`),
 * NUNCA de CDN — internet de feira é instável; se a página carregou, o validador
 * carregou. Ver public/mediapipe/face_detection/.
 *
 * O @mediapipe/face_detection retorna 6 keypoints por rosto; índices 0 e 1 são
 * olho direito e esquerdo (normalizados) — a interocular sai daí.
 */
import type { FaceDetection, Results } from '@mediapipe/face_detection'

const ASSET_BASE = '/mediapipe/face_detection/'

// Gate de tamanho (interocular mínima em px na imagem submetida). Fonte única em
// lib/face/status.ts (usado também pelos endpoints). Calibrado em 60 na bancada
// (Fatia 2): acima da zona de sobreposição ~41–53 do MediaPipe com margem de ruído.
// No upload (Fatia 4) medimos 2–3× + MEDIANA; na câmera ao vivo o ruído se dilui
// em vários frames + histerese.
import { MIN_INTEROCULAR_PX } from './status'
export { MIN_INTEROCULAR_PX }

export type FaceReason = 'noFace' | 'tooSmall' | 'ok'

export interface FaceMeasurement {
  faceCount: number
  interocularPx: number // 0 se nenhum rosto
  bbox?: { x: number; y: number; w: number; h: number } // px na imagem
}

export interface FaceValidation {
  ok: boolean
  reason: FaceReason
  interocularPx: number
}

let _detector: FaceDetection | null = null
let _pending: ((m: FaceMeasurement) => void) | null = null
let _lastW = 0
let _lastH = 0

async function getDetector(): Promise<FaceDetection> {
  if (_detector) return _detector
  // import dinâmico: o pacote referencia globals de browser; não pode rodar no SSR
  const mod = await import('@mediapipe/face_detection')
  const detector = new mod.FaceDetection({ locateFile: (file: string) => ASSET_BASE + file })
  detector.setOptions({ model: 'short', selfieMode: false, minDetectionConfidence: 0.5 })
  detector.onResults((res: Results) => {
    const resolve = _pending
    _pending = null
    if (!resolve) return
    const dets = res.detections || []
    if (!dets.length) { resolve({ faceCount: 0, interocularPx: 0 }); return }
    // maior rosto do quadro
    const d = dets.reduce((a, b) =>
      a.boundingBox.width * a.boundingBox.height >= b.boundingBox.width * b.boundingBox.height ? a : b)
    const k = d.landmarks
    const rEye = k[0], lEye = k[1]
    const dx = (rEye.x - lEye.x) * _lastW
    const dy = (rEye.y - lEye.y) * _lastH
    const interocularPx = Math.round(Math.sqrt(dx * dx + dy * dy))
    const bb = d.boundingBox
    resolve({
      faceCount: dets.length,
      interocularPx,
      bbox: { x: Math.round((bb.xCenter - bb.width / 2) * _lastW), y: Math.round((bb.yCenter - bb.height / 2) * _lastH), w: Math.round(bb.width * _lastW), h: Math.round(bb.height * _lastH) }
    })
  })
  await detector.initialize()
  _detector = detector
  return detector
}

// Dimensões intrínsecas do elemento (a régua da interocular). MediaPipe devolve
// landmarks normalizados (0–1); multiplicar pelas dimensões DESTE elemento dá a
// interocular em px nele. Por isso o contrato abaixo.
function intrinsicSize(el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): { w: number; h: number } {
  if ('videoWidth' in el) return { w: el.videoWidth, h: el.videoHeight }
  if ('naturalWidth' in el) return { w: el.naturalWidth, h: el.naturalHeight }
  return { w: el.width, h: el.height }
}

/**
 * Mede o rosto. CONTRATO IMPORTANTE: `image` deve estar na **resolução de
 * submissão** — ou seja, o chamador passa o **canvas já redimensionado para
 * ~800px** (o mesmo que produz o JPEG enviado ao servidor/terminal), NÃO a foto
 * original em alta resolução. A interocular é medida nos pixels deste elemento;
 * o gate de 60px foi calibrado nessa régua (~800px). Passar a original mudaria a
 * escala e quebraria o gate.
 */
async function doDetect(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<FaceMeasurement> {
  const det = await getDetector()
  const { w, h } = intrinsicSize(image)
  _lastW = w
  _lastH = h
  return new Promise<FaceMeasurement>((resolve) => {
    _pending = resolve
    det.send({ image }).catch(() => { _pending = null; resolve({ faceCount: 0, interocularPx: 0 }) })
  })
}

// SERIALIZA as chamadas. O detector é singleton (um _pending por vez); chamadas
// concorrentes (ex.: loop da câmera + upload, ou capturas em paralelo) clobravam
// o _pending e TRAVAVAM a promise. A fila garante uma detecção por vez.
let _chain: Promise<unknown> = Promise.resolve()
export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<FaceMeasurement> {
  const p = _chain.then(() => doDetect(image), () => doDetect(image))
  _chain = p.then(() => undefined, () => undefined)
  return p
}

/** Aplica o gate espelhando o terminal: sem rosto / rosto pequeno / ok. */
export function validateFace(m: FaceMeasurement, minPx: number = MIN_INTEROCULAR_PX): FaceValidation {
  if (m.faceCount === 0 || m.interocularPx === 0) return { ok: false, reason: 'noFace', interocularPx: 0 }
  if (m.interocularPx < minPx) return { ok: false, reason: 'tooSmall', interocularPx: m.interocularPx }
  return { ok: true, reason: 'ok', interocularPx: m.interocularPx }
}

/**
 * Decide o gate a partir de N medições do MESMO frame submetido (captura da
 * câmera OU upload). Cada leitura é a interocular em px (0 = sem rosto naquela
 * leitura). REGRA DE SEGURANÇA: exige rosto na MAIORIA ESTRITA das leituras — um
 * único falso-positivo do detector NÃO pode liberar uma foto sem rosto (era o
 * furo do gate: `median(reads.filter(>0))` deixava [65,0,0] passar). Só então
 * mede a interocular (mediana das leituras com rosto) e exige ≥ minPx.
 */
export function decideFromReads(reads: number[], minPx: number = MIN_INTEROCULAR_PX): FaceValidation {
  const present = reads.filter(x => x > 0)
  if (present.length * 2 <= reads.length) return { ok: false, reason: 'noFace', interocularPx: 0 }
  const ip = median(present)
  if (ip < minPx) return { ok: false, reason: 'tooSmall', interocularPx: ip }
  return { ok: true, reason: 'ok', interocularPx: ip }
}

// ── Suavização do gate AO VIVO (câmera) ──────────────────────────────────────
// O MediaPipe oscila ±~10px; perto do gate (60) o estado tremularia
// (aproxime/ok/aproxime). Combinamos MEDIANA dos últimos N frames (mata o spike
// solto) + HISTERESE (faixa morta 55–65): só vira 'ok' com mediana ≥65, só sai
// de 'ok' com mediana <55. Funções PURAS, testáveis sem câmera.
export const GATE_ENTER_PX = MIN_INTEROCULAR_PX + 5 // 65 — entra em ok
export const GATE_EXIT_PX = MIN_INTEROCULAR_PX - 5  // 55 — sai de ok

export function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * Próximo estado do gate ao vivo a partir do histórico de interoculares
 * (0 = sem rosto naquele frame) e do estado anterior. Mediana dos últimos 5 +
 * histerese. Evita que a mensagem fique "nervosa" no limiar.
 */
export function nextGateState(history: number[], prev: FaceReason): FaceReason {
  const recent = history.slice(-5)
  if (!recent.length) return 'noFace'
  const noFace = recent.filter(x => x === 0).length
  if (noFace > recent.length / 2) return 'noFace'
  const m = median(recent.filter(x => x > 0))
  if (prev === 'ok') return m < GATE_EXIT_PX ? 'tooSmall' : 'ok'
  return m >= GATE_ENTER_PX ? 'ok' : 'tooSmall'
}
