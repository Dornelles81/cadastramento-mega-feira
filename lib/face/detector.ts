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
import { MIN_INTEROCULAR_PX, INTEROCULAR_MAX } from './status'
export { MIN_INTEROCULAR_PX, INTEROCULAR_MAX }

export type FaceReason = 'noFace' | 'tooSmall' | 'tooBig' | 'ok'

export interface FaceMeasurement {
  faceCount: number
  interocularPx: number // 0 se nenhum rosto
  bbox?: { x: number; y: number; w: number; h: number } // px na imagem
  // [Fase A] Aditivo: os 6 keypoints em PIXELS (0 olho dir,1 olho esq,2 nariz,
  // 3 boca,4 orelha dir,5 orelha esq) — usados só para o cálculo de pose/overlay.
  keypoints?: { x: number; y: number }[]
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

// [robustez] Recuperação de detecção-lixo. Em alguns Androids o MediaPipe passa a emitir
// coords FORA de 0–1 após ~1s (bbox/landmarks gigantes/negativos). Sem validar, isso é
// multiplicado por _lastW e estoura o gate (io gigante → "Afaste" falso). Validamos a saída;
// se o lixo persistir, re-inicializamos o detector (recria a instância → volta o output normal).
let _lastGarbage = false        // o último frame teve detecção REJEITADA por coords insanas
let _garbageStreak = 0          // frames-lixo consecutivos
let _reinitCount = 0            // re-inits na "sessão ruim" atual (evita loop de re-init)
let _lastReinitAt = 0           // timestamp do último re-init (cooldown)
let _reinitInFlight = false     // trava: nunca dois re-inits simultâneos (upload + loop, etc.)
let _exhausted = false          // esgotou os re-inits e o lixo persiste → componente cai no upload
const GARBAGE_REINIT_STREAK = 10 // ~2.5s a 250ms/frame de lixo seguido → dispara o re-init
const REINIT_COOLDOWN_MS = 5000  // no máx. 1 re-init a cada 5s
const MAX_REINITS = 3            // teto por sessão ruim (além disso, fica no fallback de upload)

// Coord normalizada sã: 0–1 com folga p/ rosto na borda. Fora disso = lixo do MediaPipe.
function inNormRange(v: number): boolean {
  return Number.isFinite(v) && v >= -0.2 && v <= 1.2
}
// Rejeita detecção com bbox/landmarks fora da faixa normalizada (o sintoma do bug do Android).
function isSaneDetection(d: any): boolean {
  const b = d?.boundingBox
  if (!b) return false
  if (!inNormRange(b.xCenter) || !inNormRange(b.yCenter)) return false
  if (!(b.width > 0 && b.width <= 1.2) || !(b.height > 0 && b.height <= 1.2)) return false
  const k = d.landmarks
  if (!k || k.length < 2) return false
  // valida olhos (0,1) e nariz (2), se houver — os pontos que alimentam io/pose
  for (let i = 0; i < Math.min(k.length, 3); i++) {
    if (!inNormRange(k[i].x) || !inNormRange(k[i].y)) return false
  }
  return true
}

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
    _lastGarbage = false
    const dets = res.detections || []
    // guarda de dimensão: sem rosto OU dimensões inválidas → noFace (não calcula nada)
    if (!dets.length || !(_lastW > 0) || !(_lastH > 0)) { resolve({ faceCount: 0, interocularPx: 0 }); return }
    // maior rosto do quadro
    const d = dets.reduce((a, b) =>
      a.boundingBox.width * a.boundingBox.height >= b.boundingBox.width * b.boundingBox.height ? a : b)
    // [robustez] REJEITA detecção-lixo: se as coords não são normalizadas (0–1), o MediaPipe
    // devolveu lixo (o bug do Android após ~1s) → trata como SEM ROSTO, em vez de multiplicar o
    // lixo por _lastW e estourar o gate (io gigante → "Afaste" falso).
    if (!isSaneDetection(d)) { _lastGarbage = true; resolve({ faceCount: 0, interocularPx: 0 }); return }
    const k = d.landmarks
    const rEye = k[0], lEye = k[1]
    const dx = (rEye.x - lEye.x) * _lastW
    const dy = (rEye.y - lEye.y) * _lastH
    const interocularPx = Math.round(Math.sqrt(dx * dx + dy * dy))
    // sanidade final: a interocular não pode exceder a largura do frame
    if (interocularPx > _lastW) { _lastGarbage = true; resolve({ faceCount: 0, interocularPx: 0 }); return }
    const bb = d.boundingBox
    // [Fase A] keypoints em pixels (aditivo — NÃO altera a interocular acima).
    const keypoints = (k as any[]).map((p) => ({ x: p.x * _lastW, y: p.y * _lastH }))
    resolve({
      faceCount: dets.length,
      interocularPx,
      bbox: { x: Math.round((bb.xCenter - bb.width / 2) * _lastW), y: Math.round((bb.yCenter - bb.height / 2) * _lastH), w: Math.round(bb.width * _lastW), h: Math.round(bb.height * _lastH) },
      keypoints
    })
  })
  await detector.initialize()
  _detector = detector
  return detector
}

// [robustez] Recria o detector do zero (dispose + null → o próximo getDetector recria). Recupera
// o output normalizado quando o MediaPipe flipa pra lixo de forma PERSISTENTE. Cooldown/teto
// controlados no chamador (detectFace) pra não entrar em loop de re-init.
async function reinitDetector(): Promise<void> {
  const old = _detector
  _detector = null
  _pending = null
  _lastReinitAt = Date.now()
  _reinitCount++
  try { await old?.close() } catch { /* ignora falha do dispose */ }
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
  const m = await p
  // [robustez] Conta lixo consecutivo; se persistir (e dentro do cooldown/teto), re-inicializa o
  // detector pra recuperar. Serializado: detectFace só re-corre após este await (o loop da câmera
  // é guardado por detectingRef), então o re-init nunca colide com um send em andamento.
  if (_lastGarbage) {
    _garbageStreak++
    const streakHit = _garbageStreak >= GARBAGE_REINIT_STREAK
    if (
      streakHit &&
      !_reinitInFlight &&
      _reinitCount < MAX_REINITS &&
      Date.now() - _lastReinitAt >= REINIT_COOLDOWN_MS
    ) {
      _reinitInFlight = true
      try { await reinitDetector() } finally { _reinitInFlight = false }
      _garbageStreak = 0
    } else if (streakHit && _reinitCount >= MAX_REINITS) {
      // já usou os re-inits e o lixo persiste → sinaliza o componente p/ cair no upload (A)
      _exhausted = true
    }
  } else {
    _garbageStreak = 0
    _reinitCount = 0 // sequência boa → zera o teto (permite recuperar de episódios futuros)
    _exhausted = false // recuperou → some o fallback
  }
  return m
}

// [A] Sinal p/ o componente: os re-inits esgotaram e o detector segue devolvendo lixo → cair no
// fallback de upload (paralelo ao CAM-3). Só liga DEPOIS dos MAX_REINITS falharem; se o re-init
// recuperar (caso comum), nunca liga. Em aparelho estável NUNCA liga (nenhum frame vira lixo).
export function isDetectorExhausted(): boolean {
  return _exhausted
}

// [A] Zera o estado de recuperação (lixo/re-init/esgotamento). Chamado ao (re)iniciar a câmera
// pra dar uma chance limpa (ex.: "Tentar novamente" após o fallback).
export function resetDetectorRecovery(): void {
  _lastGarbage = false
  _garbageStreak = 0
  _reinitCount = 0
  _exhausted = false
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
export const GATE_ENTER_PX = MIN_INTEROCULAR_PX + 5 // 65 — entra em ok (borda inferior)
export const GATE_EXIT_PX = MIN_INTEROCULAR_PX - 5  // 55 — sai de ok (pra tooSmall)
// [A2] Borda SUPERIOR (perto/grande demais), histerese espelhando a inferior:
export const GATE_BIG_ENTER_PX = INTEROCULAR_MAX + 5  // 185 — sai de ok pra 'tooBig'
export const GATE_BIG_EXIT_PX = INTEROCULAR_MAX - 10  // 170 — volta a ok (fica acima do preenche-oval ~167)

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
  // [A2] Histerese em torno das DUAS bordas. De 'ok', sai imediato ao cruzar a EXIT
  // (pra baixo → tooSmall; pra cima → tooBig). Fora de 'ok', só entra dentro da faixa
  // com folga [GATE_ENTER .. GATE_BIG_EXIT]; senão fica no lado correspondente (robusto
  // a saltos, ex.: pular de tooBig direto pra tooSmall).
  if (prev === 'ok') {
    if (m < GATE_EXIT_PX) return 'tooSmall'
    if (m > GATE_BIG_ENTER_PX) return 'tooBig'
    return 'ok'
  }
  if (m < GATE_ENTER_PX) return 'tooSmall'
  if (m > GATE_BIG_EXIT_PX) return 'tooBig'
  return 'ok'
}
