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

/**
 * Gate de tamanho: interocular mínima (px) NA IMAGEM SUBMETIDA. Cravado em 60
 * pelo cross-check de calibração na bancada (Fatia 2): o terminal corta em ~w157
 * e o MediaPipe lê ~43–53px nesse ponto (régua diferente da do device + ruído
 * ±~10px). 60 fica ACIMA da zona de sobreposição (~41–53) com margem de ruído —
 * conservador: rosto distante pede "aproxime"; selfie normal lê 70–120px.
 *
 * FATIA 4 (upload): chamar detectFace 2–3× e usar a MEDIANA da interocular antes
 * de validar — uma leitura solta tem ruído ±~10px (na câmera ao vivo isso já se
 * dilui em vários frames).
 */
export const MIN_INTEROCULAR_PX = 60

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
export async function detectFace(
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

/** Aplica o gate espelhando o terminal: sem rosto / rosto pequeno / ok. */
export function validateFace(m: FaceMeasurement, minPx: number = MIN_INTEROCULAR_PX): FaceValidation {
  if (m.faceCount === 0 || m.interocularPx === 0) return { ok: false, reason: 'noFace', interocularPx: 0 }
  if (m.interocularPx < minPx) return { ok: false, reason: 'tooSmall', interocularPx: m.interocularPx }
  return { ok: true, reason: 'ok', interocularPx: m.interocularPx }
}
