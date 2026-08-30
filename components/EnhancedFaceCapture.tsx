'use client'

import { useRef, useState, useEffect, useCallback, memo, type RefObject } from 'react'
import { detectFace as mpDetectFace, decideFromReads, nextGateState, GATE_BIG_EXIT_PX, INTEROCULAR_MAX, isDetectorExhausted, resetDetectorRecovery, type FaceReason } from '../lib/face/detector'
import { computePose, type Pose } from '../lib/face/pose'
import { decideCapture, DEFAULT_FRAMING_THRESHOLDS, type CaptureReason } from '../lib/face/gate'
import { compressCanvasToLimit, FACE_TOO_LARGE_MESSAGE } from '../lib/face/size-limit'

interface EnhancedFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

// [C2-a] Métricas de ENQUADRAMENTO só para o overlay de debug (calibração do bbox).
interface FrameDebug {
  cx: number; cy: number   // centro do rosto normalizado (0–1) no frame ≤800
  dx: number; dy: number   // desvio do ALVO do bbox (gate.ts centerX/Y = 0.50/0.65)
  l: number; r: number; t: number; b: number // folgas às bordas (normalizadas)
  bx: number; by: number; bw: number; bh: number // bbox bruto (px)
  io: number // [A1] interocular (px no buffer) — sinal do limite de distância (calibrar teto)
  fw: number; fh: number // [C3.1] dimensões do frame medido (buffer do vídeo, ≤800)
  // [C3.3] Métricas EXIBIDAS (mesma régua na tela) p/ calibrar o oval vs o rosto real:
  // o vídeo aparece via object-cover (escala UNIFORME + crop), o canvas do oval via
  // stretch — comparar exige converter os dois pro espaço exibido.
  boxW: number; boxH: number   // caixa exibida (clientWidth/Height)
  cover: number                // fator de escala do vídeo na caixa (object-cover)
  dbw: number; dbh: number     // bbox EXIBIDO (bw·cover × bh·cover)
  dbcx: number; dbcy: number   // centro do bbox EXIBIDO (px na caixa, já descontado o crop)
  ovw: number; ovh: number     // oval EXIBIDO (diâmetros 2rx × 2ry)
  ovcx: number; ovcy: number   // centro do oval EXIBIDO (px na caixa)
}

// [B] Monta o HTML do overlay de debug (mesmos dados/cores de antes) para escrita IMPERATIVA
// via innerHTML — sem passar por state/re-render do React. Strings estáticas (sem input do
// usuário) → innerHTML seguro. yaw/pitch/roll vêm da pose; o resto do frame (fd).
function buildDebugHTML(pose: Pose | null, fd: FrameDebug | null, vid?: { w: number; h: number; rs: number }): string {
  const s = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2)
  // [vid] dimensão/readyState do <video> — sempre visível (mesmo sem detecção), pra distinguir
  // "câmera sem dimensão" (0×0) de "detector não acha" (600×800 + io: —).
  const vidLine = vid ? `vid: ${vid.w}×${vid.h} rs:${vid.rs}` : 'vid: —'
  const yaw = pose ? pose.yaw.toFixed(3) : '—'
  const pitch = pose ? pose.pitch.toFixed(3) : '—'
  const roll = pose ? pose.roll.toFixed(1) + '°' : '—'
  const io = fd ? fd.io + 'px' : '—'
  const c = fd ? `${fd.cx.toFixed(2)},${fd.cy.toFixed(2)}` : '—'
  const dalvo = fd ? `${s(fd.dx)},${s(fd.dy)}` : '—'
  const folgaLR = fd ? `folga L${fd.l.toFixed(2)} R${fd.r.toFixed(2)}` : 'folga L— R—'
  const folgaTB = fd ? `folga T${fd.t.toFixed(2)} B${fd.b.toFixed(2)}` : 'folga T— B—'
  const bbox = fd ? `${fd.bx},${fd.by} ${fd.bw}×${fd.bh}` : '—'
  const frame = fd ? `${fd.fw}×${fd.fh}` : '—'
  const ovalExib = fd ? `${Math.round(fd.ovw)}×${Math.round(fd.ovh)} @ ${Math.round(fd.ovcx)},${Math.round(fd.ovcy)}` : '—'
  const bboxExib = fd ? `${Math.round(fd.dbw)}×${Math.round(fd.dbh)} @ ${Math.round(fd.dbcx)},${Math.round(fd.dbcy)}` : '—'
  const box = fd ? `${fd.boxW}×${fd.boxH} cover:${fd.cover.toFixed(2)}` : '—'
  return (
    `<div class="text-cyan-300">${vidLine}</div>` +
    `<div>yaw: ${yaw}</div>` +
    `<div>pitch: ${pitch}</div>` +
    `<div>roll: ${roll}</div>` +
    `<div class="text-cyan-300">io: ${io}</div>` +
    `<div class="mt-1 border-t border-green-300/30 pt-1">c: ${c}</div>` +
    `<div>Δalvo: ${dalvo}</div>` +
    `<div>${folgaLR}</div>` +
    `<div>${folgaTB}</div>` +
    `<div class="text-green-300/60">bbox: ${bbox}</div>` +
    `<div class="text-green-300/60">frame: ${frame}</div>` +
    `<div class="mt-1 border-t border-green-300/30 pt-1 text-yellow-300">oval-exib: ${ovalExib}</div>` +
    `<div class="text-yellow-300">bbox-exib: ${bboxExib}</div>` +
    `<div class="text-yellow-300/70">box: ${box}</div>`
  )
}

// [B] Container do overlay montado UMA vez (memo, prop estável → nunca re-renderiza). O conteúdo
// é escrito imperativamente pelo loop de detecção (innerHTML no ref) → zero re-render por frame,
// não starva a câmera em aparelhos fracos. Sem ?debugPose=1 nem é montado.
const DebugOverlaySink = memo(function DebugOverlaySink({ innerRef }: { innerRef: RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      className="absolute top-16 left-2 bg-black/70 text-green-300 text-[11px] font-mono px-2 py-1 rounded leading-tight z-10"
    />
  )
})

const DETECT_MS = 250 // intervalo do loop de detecção ao vivo
const WATCHDOG_MS = 1500 // intervalo do watchdog (independente do loop de detecção)
const NOFACE_OFFER_MS = 12000 // sem rosto válido por >12s c/ câmera ativa → oferece fallback (soft)
const MSG_DEBOUNCE_FRAMES = 2 // [C1] frames estáveis antes de trocar o TEXTO da mensagem

// [C2-a] DESACOPLADO (medido ao vivo): o OVAL DESENHADO (guia visual — onde a CABEÇA
// inteira cabe) e o ALVO do bbox (medição/gate) ficam SEPARADOS, porque o bbox do
// MediaPipe corta o topo da cabeça (não pega testa/cabelo) → o centro do bbox de um
// rosto bem enquadrado cai ~0.07 ABAIXO do centro visual (offset~crop).
//  • ALVO do bbox = fonte única em gate.ts (DEFAULT_FRAMING_THRESHOLDS.centerX/Y =
//    0.50/0.65), usado pelo GATE e por este overlay (Δalvo).
//  • OVAL_* = só o desenho visual. Encaixar a cabeça no oval (0.58) → bbox no alvo
//    (0.65) → Δalvo ~0.
const OVAL_CENTER_X = 0.50
const OVAL_CENTER_Y = 0.58 // centro visual da cabeça = alvo bbox 0.65 − offset 0.07
// [C3.1] O oval tem PROPORÇÃO DE ROSTO FIXA **NA TELA** (largura/altura = 0.75, "ovo
// em pé"), independente do aspect do vídeo E do stretch do canvas. Motivo: o canvas
// do overlay é esticado pra caixa (w-full h-full) enquanto o buffer tem as dimensões
// do vídeo — raios em fração do buffer distorcem na tela (no celular retrato o oval
// aparecia DEITADO, impossível de encaixar um rosto). Os raios são calculados no
// espaço EXIBIDO e convertidos de volta pro buffer no drawOval.
// [C3.2→C3.3] TAMANHO (histórico): 0.32·H da caixa (C3.1) e depois max com 0.28·W
// (C3.2) saíam PEQUENOS no celular — a caixa é baixa/larga (42svh) e o cover corta
// 45% do vídeo retrato, então frações da CAIXA não acompanham a escala do rosto.
// [C3.3-fix] O raio é fração da ALTURA DO VÍDEO EXIBIDO (bufH·cover), NÃO da caixa.
// Medição no celular (600×800 em caixa 328×253, cover .55) provou: o rosto escala
// pela transformação do VÍDEO (object-cover), então frações da caixa deixam o oval
// pequeno quando o cover corta muito (45% no celular). Pela régua do vídeo, o 0.32
// calibrado do PC vale em qualquer aparelho (no PC vídeo exibido ≈ caixa; −3%).
// O clamp inferior saiu: o oval pode sangrar embaixo (o queixo do rosto real também
// sangra na caixa baixa); o topo fica dentro (ry ≤ centro·boxH).
const OVAL_RADIUS_Y = 0.32 // raio vertical: fração da altura do VÍDEO exibido
const OVAL_ASPECT = 0.75   // largura/altura do oval NA TELA (formato rosto)
const OVAL_MAX_RX = 0.44   // clamp: raio horizontal ≤ fração da largura exibida

// [C3.3] Raios do oval NO ESPAÇO EXIBIDO — fonte única usada pelo drawOval E pela
// instrumentação de calibração (?debugPose=1), pra medida e desenho nunca divergirem.
// bufW/bufH = dimensões do vídeo (buffer); dispW/dispH = caixa exibida (CSS).
function ovalDisplayRadii(dispW: number, dispH: number, bufW: number, bufH: number): { rx: number; ry: number } {
  const cover = bufW > 0 && bufH > 0 ? Math.max(dispW / bufW, dispH / bufH) : 1
  const vidH = bufH > 0 ? bufH * cover : dispH // altura do vídeo INTEIRO na escala exibida
  let ry = OVAL_RADIUS_Y * vidH
  ry = Math.min(ry, OVAL_CENTER_Y * dispH) // topo do oval dentro da caixa
  let rx = ry * OVAL_ASPECT
  if (rx > OVAL_MAX_RX * dispW) { // caixa estreita: encolhe mantendo a proporção
    rx = OVAL_MAX_RX * dispW
    ry = rx / OVAL_ASPECT
  }
  return { rx, ry }
}

// [CAM-3] Espera o vídeo ficar PRONTO (loadedmetadata + videoWidth>0) com timeout.
// Resolve UMA vez (settled) — 'loadedmetadata' e o timeout competem, o 1º vence e o
// outro vira no-op; sempre limpa listener+timer no settle (sem órfãos). `forceFail`
// (hook de teste ?forceBlack) ignora a prontidão e deixa só o timeout vencer → simula
// vídeo preto sem câmera preta real. Função PURA (sem estado do componente).
function waitForVideoReady(video: HTMLVideoElement, timeoutMs: number, forceFail: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      video.removeEventListener('loadedmetadata', onMeta)
      if (timer !== undefined) clearTimeout(timer)
      resolve(ready)
    }
    function onMeta() { if (video.videoWidth > 0) finish(true) }
    if (!forceFail && video.videoWidth > 0) { finish(true); return }
    if (!forceFail) video.addEventListener('loadedmetadata', onMeta)
    timer = setTimeout(() => finish(false), timeoutMs)
  })
}

export default function EnhancedFaceCapture({ onCapture, onBack }: EnhancedFaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null) // overlay (oval)
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null) // offscreen ~800px (submissão + detecção)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [gateState, setGateState] = useState<FaceReason>('noFace')
  const streamRef = useRef<MediaStream | null>(null)
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const historyRef = useRef<number[]>([]) // últimas interoculares (0 = sem rosto)
  const wasTooCloseRef = useRef(false) // [A2] sticky: rosto estava perto/grande demais → msg noFace vira "Afaste"
  const gateStateRef = useRef<FaceReason>('noFace') // espelha gateState p/ o loop/captura
  const detectingRef = useRef(false) // guarda contra detecção concorrente
  const [showUploadOption, setShowUploadOption] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // [watchdog] soft-offer de upload quando a câmera está no ar mas nenhum rosto é detectado por
  // muito tempo (videoWidth=0 tardio / faceCount:0 / detector travado). Não para a câmera.
  const lastFaceAtRef = useRef<number>(0)               // timestamp do último faceCount>0
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const [uploadHint, setUploadHint] = useState<string | null>(null) // msg suave do soft-offer

  // [Fase A] Debug de pose (yaw/pitch/roll) atrás do flag ?debugPose=1 — SÓ EXIBE,
  // não afeta o gate nem a habilitação do botão. Sem o flag, o fluxo é idêntico.
  const debugPoseRef = useRef(false)
  const [showPoseDebug, setShowPoseDebug] = useState(false)
  const [poseDebug, setPoseDebug] = useState<Pose | null>(null) // usado só no overlay da foto enviada
  const liveDebugRef = useRef<HTMLDivElement>(null)             // [B] overlay ao vivo: escrita imperativa (innerHTML)
  // [Fase B] Modo "só pose" do upload debug: exibe a pose da foto e PARA (não grava,
  // não avança). Distingue do preview de uma captura real (que processa e navega).
  const [poseOnly, setPoseOnly] = useState(false)

  // [Fase C1] Gate de POSE ao vivo, atrás de ?poseGate=1 (default OFF → produção
  // IDÊNTICA). liveReason é o reason combinado (imediato → okState/oval/botão);
  // msgReason é o texto (com debounce SÓ quando a flag está ligada).
  const poseGateRef = useRef(false)
  const posePrevRef = useRef<CaptureReason>('noFace') // reason anterior p/ histerese
  const [liveReason, setLiveReason] = useState<CaptureReason>('noFace')
  const liveReasonRef = useRef<CaptureReason>('noFace')
  const [msgReason, setMsgReason] = useState<CaptureReason>('noFace')
  const msgReasonRef = useRef<CaptureReason>('noFace')
  const msgPendingRef = useRef<CaptureReason>('noFace')
  const msgCountRef = useRef(0)

  // [CAM-3] Guardas de concorrência (#5) + recuperação de vídeo preto.
  const mountedRef = useRef(true)               // não setState após unmount
  const startTokenRef = useRef(0)               // só o ciclo de startCamera MAIS RECENTE vence
  const forceBlackRef = useRef<'off' | 'always' | 'once'>('off') // hook de teste ?forceBlack
  const [cameraFailed, setCameraFailed] = useState(false) // erro terminal → botão "Tentar novamente"

  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const on = params?.get('debugPose') === '1'
    debugPoseRef.current = on
    setShowPoseDebug(on)
    poseGateRef.current = params?.get('poseGate') === '1'
    // [CAM-3] ?forceBlack=1|true → sempre preto; =once → só a 1ª tentativa (testa retry ok)
    const fb = params?.get('forceBlack')
    forceBlackRef.current = (fb === '1' || fb === 'true') ? 'always' : fb === 'once' ? 'once' : 'off'
  }, [])

  // [CAM-3/#5] Marca desmontagem para as guardas de startCamera não tocarem state morto.
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Desenha o frame atual do vídeo redimensionado para ≤800px (a MESMA imagem
  // que será submetida) num canvas offscreen — contrato da régua do detector.
  const buildFrameCanvas = (): HTMLCanvasElement | null => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    let width = video.videoWidth
    let height = video.videoHeight
    const maxSize = 800
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize }
      else { width = Math.round((width / height) * maxSize); height = maxSize }
    }
    let c = frameCanvasRef.current
    if (!c) { c = document.createElement('canvas'); frameCanvasRef.current = c }
    c.width = width; c.height = height
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -width, 0, width, height); ctx.restore()
    return c
  }

  // Desenha o oval-guia colorido pelo estado do gate. Cores da tabela da Fase C:
  // ok=verde; tooSmall/offCenter/cutOff=amarelo; noFace/tilt/turn=vermelho.
  const drawOval = (state: CaptureReason) => {
    const video = videoRef.current
    const oc = canvasRef.current
    if (!video || !oc || !video.videoWidth) return
    oc.width = video.videoWidth; oc.height = video.videoHeight
    const ctx = oc.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, oc.width, oc.height)
    const color = state === 'ok' ? '#22c55e'
      : (state === 'tooSmall' || state === 'tooBig' || state === 'offCenter' || state === 'cutOff') ? '#eab308'
        : '#ef4444'
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.setLineDash([14, 9])
    ctx.beginPath()
    // [C3.1] Raios no espaço EXIBIDO (proporção de rosto fixa na tela) → buffer.
    // clientWidth/Height = tamanho CSS da caixa; oc.width/height = buffer do vídeo.
    const dispW = oc.clientWidth || oc.width
    const dispH = oc.clientHeight || oc.height
    // [C3.2/C3.3] raios no espaço exibido (helper = fonte única com a instrumentação)
    const { rx: rxDisp, ry: ryDisp } = ovalDisplayRadii(dispW, dispH, oc.width, oc.height)
    const rx = rxDisp * (oc.width / dispW)
    const ry = ryDisp * (oc.height / dispH)
    ctx.ellipse(oc.width * OVAL_CENTER_X, oc.height * OVAL_CENTER_Y, rx, ry, 0, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // [C1] Aplica o reason combinado do frame: okState/oval imediatos (a histerese do
  // gate já os mantém estáveis) e a MENSAGEM com debounce SÓ quando ?poseGate=1
  // (evita o texto piscar entre dois bloqueios na fronteira). Sem a flag, o texto
  // troca na hora → idêntico ao de hoje.
  const applyReason = (reason: CaptureReason) => {
    posePrevRef.current = reason
    if (liveReasonRef.current !== reason) { liveReasonRef.current = reason; setLiveReason(reason) }
    drawOval(reason)
    if (poseGateRef.current) {
      if (msgPendingRef.current !== reason) { msgPendingRef.current = reason; msgCountRef.current = 1 }
      else { msgCountRef.current++ }
      if (msgCountRef.current >= MSG_DEBOUNCE_FRAMES && msgReasonRef.current !== reason) {
        msgReasonRef.current = reason; setMsgReason(reason)
      }
    } else {
      msgPendingRef.current = reason; msgCountRef.current = MSG_DEBOUNCE_FRAMES
      if (msgReasonRef.current !== reason) { msgReasonRef.current = reason; setMsgReason(reason) }
    }
  }


  // Texto do indicador por reason (tabela da Fase C). turn* → frase NEUTRA (achado
  // MIRROR: não arriscar direção).
  const captureMsg = (r: CaptureReason): string =>
    r === 'ok' ? 'Rosto OK ✓'
      : r === 'tooSmall' ? 'Aproxime o rosto'
        : r === 'tooBig' ? 'Afaste um pouco o rosto'
        : r === 'tilt' ? 'Endireite a cabeça'
          : (r === 'turnLeft' || r === 'turnRight') ? 'Vire o rosto para frente'
            : r === 'cutOff' ? 'Enquadre o rosto no círculo'
              : r === 'offCenter' ? 'Centralize o rosto'
                : 'Centralize seu rosto'

  // Loop de detecção ao vivo: mede no frame redimensionado, suaviza (mediana +
  // histerese) e atualiza o estado do gate + o oval. Sem heurística de pele.
  const runDetection = useCallback(async () => {
    if (detectingRef.current) return
    detectingRef.current = true
    try {
      // [vid] Diagnóstico incondicional (ANTES do guard de frame): dimensão/readyState do <video>.
      // Se videoWidth=0, o overlay mostra "vid: 0×0" e o loop retorna aqui — sem isso, ficava mudo.
      const video = videoRef.current
      const vid = { w: video?.videoWidth ?? 0, h: video?.videoHeight ?? 0, rs: video?.readyState ?? 0 }
      if (debugPoseRef.current && liveDebugRef.current) {
        liveDebugRef.current.innerHTML = buildDebugHTML(null, null, vid)
      }
      const frame = buildFrameCanvas()
      if (!frame) return
      const m = await mpDetectFace(frame)
      // [watchdog] marca o último rosto válido (o detector já rejeita lixo → faceCount>0 = são)
      if (m.faceCount > 0) lastFaceAtRef.current = Date.now()
      // [A] Detector esgotou os re-inits e segue devolvendo lixo → fallback de upload (paralelo
      // ao CAM-3). Só entra DEPOIS dos MAX_REINITS falharem; se o re-init recuperar, nunca entra.
      if (isDetectorExhausted() && mountedRef.current) {
        stopCamera() // para o stream + o loop (clearInterval)
        setError('❌ Não foi possível usar a câmera.\n\nToque abaixo para enviar uma foto.')
        setShowUploadOption(true)
        setCameraFailed(true)
        return
      }
      // [C1] Pose calculada a CADA frame (barato) — alimenta o overlay de debug E
      // o gate combinado (quando ?poseGate=1). Sem rosto/keypoints → null.
      const pose = m.faceCount > 0 && m.keypoints ? computePose(m.keypoints) : null
      // [B] Debug IMPERATIVO: calcula o enquadramento e escreve direto no DOM (innerHTML no ref),
      // SEM nenhum setState por frame → zero re-render → não starva a câmera em aparelhos fracos.
      // Mesmos dados/cores de antes (buildDebugHTML). Δalvo = desvio do ALVO DO BBOX (gate.ts
      // DEFAULT_FRAMING_THRESHOLDS = 0.50/0.65 — fonte única).
      if (debugPoseRef.current && liveDebugRef.current) {
        let fd: FrameDebug | null = null
        if (m.faceCount > 0 && m.bbox) {
          const W = frame.width, H = frame.height, bb = m.bbox
          const cx = (bb.x + bb.w / 2) / W, cy = (bb.y + bb.h / 2) / H
          // [C3.3] Conversões pro ESPAÇO EXIBIDO (mesma régua do olho):
          //  • vídeo: object-cover → escala uniforme `cover` + crop centrado;
          //  • oval: helper ovalDisplayRadii (o mesmo que desenha).
          const oc = canvasRef.current
          const boxW = oc?.clientWidth || W
          const boxH = oc?.clientHeight || H
          const cover = Math.max(boxW / W, boxH / H)
          const cropX = (W - boxW / cover) / 2 // buffer px cortados de cada lado
          const cropY = (H - boxH / cover) / 2
          const { rx: orx, ry: ory } = ovalDisplayRadii(boxW, boxH, W, H)
          fd = {
            cx, cy, dx: cx - DEFAULT_FRAMING_THRESHOLDS.centerX, dy: cy - DEFAULT_FRAMING_THRESHOLDS.centerY,
            l: bb.x / W, r: (W - (bb.x + bb.w)) / W, t: bb.y / H, b: (H - (bb.y + bb.h)) / H,
            bx: bb.x, by: bb.y, bw: bb.w, bh: bb.h,
            io: m.interocularPx,
            fw: W, fh: H,
            boxW, boxH, cover,
            dbw: bb.w * cover, dbh: bb.h * cover,
            dbcx: (bb.x + bb.w / 2 - cropX) * cover, dbcy: (bb.y + bb.h / 2 - cropY) * cover,
            ovw: 2 * orx, ovh: 2 * ory,
            ovcx: OVAL_CENTER_X * boxW, ovcy: OVAL_CENTER_Y * boxH
          }
        }
        liveDebugRef.current.innerHTML = buildDebugHTML(pose, fd, vid)
      }
      // SEM ROSTO = no_face IMEDIATO: zera a janela da mediana e cai pro vermelho
      // na hora, SEM suavização. A mediana/histerese só vale p/ o tamanho
      // (tooSmall↔ok) com rosto presente — nunca pode segurar 'ok' verde depois
      // que o rosto saiu do quadro (era o furo: o verde segurava ~500ms).
      if (m.faceCount === 0) {
        historyRef.current = []
        // [A2/(b)-refinada] Se o rosto ACABOU de sumir estando perto/grande demais
        // (wasTooCloseRef sticky), o mais provável é PROXIMIDADE (o short-range perde
        // rosto colado) → mostra "Afaste um pouco" (tooBig) em vez de "Centralize"
        // (noFace). O ref só zera quando um rosto volta pra distância confortável.
        const reason: FaceReason = wasTooCloseRef.current ? 'tooBig' : 'noFace'
        if (gateStateRef.current !== reason) { gateStateRef.current = reason; setGateState(reason) }
        applyReason(reason)
        return
      }
      const hist = historyRef.current
      hist.push(m.interocularPx)
      if (hist.length > 8) hist.shift()
      // [A2] Marca "estava perto demais" com histerese (mesmas bordas do gate): liga ao
      // atingir o teto, desliga ao voltar pra faixa confortável. Alimenta a (b)-refinada.
      if (m.interocularPx >= INTEROCULAR_MAX) wasTooCloseRef.current = true
      else if (m.interocularPx <= GATE_BIG_EXIT_PX) wasTooCloseRef.current = false
      // DISTÂNCIA (INTOCADA): fonte de verdade do gate de tamanho.
      const next = nextGateState(hist, gateStateRef.current)
      if (next !== gateStateRef.current) { gateStateRef.current = next; setGateState(next) }
      // [C1+C2-b] Combina POSE (yaw+roll) e ENQUADRAMENTO (bbox) SÓ com ?poseGate=1.
      // Sem a flag, reason = next (distância pura) → byte-a-byte idêntico ao de hoje.
      let reason: CaptureReason = next
      if (poseGateRef.current) {
        reason = decideCapture(
          { distanceReason: next, pose, bbox: m.bbox, frameW: frame.width, frameH: frame.height, mirrored: false },
          posePrevRef.current
        )
      }
      applyReason(reason)
    } catch {
      // detector indisponível: mantém estado; o gate da captura ainda revalida
    } finally {
      detectingRef.current = false
    }
  }, [])

  const startDetectionLoop = useCallback(() => {
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current)
    detectionIntervalRef.current = setInterval(runDetection, DETECT_MS)
  }, [runDetection])

  // [watchdog] Interval SEPARADO (não depende do runDetection nem do detector resolver): se a
  // câmera está ativa e nenhum rosto válido é detectado há > NOFACE_OFFER_MS, OFERECE o upload
  // (revela o botão + msg suave). NÃO para a câmera (alternativa, não desistência). Cobre
  // videoWidth=0 tardio, faceCount:0 persistente e detector travado. Some em aparelho bom
  // (detecta em segundos → lastFaceAt sempre recente → nunca dispara).
  const startWatchdog = useCallback(() => {
    if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current)
    watchdogIntervalRef.current = setInterval(() => {
      if (!streamRef.current) return // câmera parada (CAM-3/erro já cuidou) → nada a fazer
      if (Date.now() - lastFaceAtRef.current > NOFACE_OFFER_MS) {
        setShowUploadOption(true)
        setUploadHint('Está com dificuldade com a câmera? Toque no botão abaixo para enviar uma foto.')
        // uma vez revelado, para de checar (o botão fica; a câmera segue tentando)
        if (watchdogIntervalRef.current) { clearInterval(watchdogIntervalRef.current); watchdogIntervalRef.current = undefined }
      }
    }, WATCHDOG_MS)
  }, [])

  // Inicia a câmera. [CAM-2] idempotente; [CAM-3] espera prontidão + recuperação de vídeo
  // preto (retry 1× → erro + fallback upload); [#5] guardas mountedRef/token após cada await.
  const startCamera = async (attempt = 0) => {
    const myToken = ++startTokenRef.current
    // guarda pós-await: seguir só se ainda montado E este é o ciclo mais recente
    const alive = () => mountedRef.current && startTokenRef.current === myToken
    try {
      // [CAM-2] Idempotente: se já há stream ativo, PARA antes de re-adquirir — nunca
      // empilhar getUserMedia (reabrir/retry/corrida → preto em aparelho de câmera única).
      if (streamRef.current) stopCamera()
      setError(null)
      setCameraFailed(false)
      setUploadHint(null) // [watchdog] limpa o soft-offer no (re)início
      historyRef.current = []
      resetDetectorRecovery() // [A] chance limpa de detecção (zera lixo/re-init/esgotamento)
      gateStateRef.current = 'noFace'
      setGateState('noFace')

      const isHttp = window.location.protocol === 'http:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'

      if (isHttp) {
        setError('📱 Use a câmera do seu celular!\n\n' +
          '👇 Toque no botão abaixo para tirar sua foto.\n\n' +
          '💡 O botão abrirá a câmera nativa do seu smartphone.')
        setShowUploadOption(true)
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 960, min: 480 },
          aspectRatio: { ideal: 4 / 3 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: false
      })

      // [#5] Pós-await: se desmontou ou um ciclo mais novo assumiu, solta ESTE stream e
      // sai SEM tocar state (evita stream órfão e setState pós-unmount).
      const video = videoRef.current
      if (!alive() || !video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      streamRef.current = stream

      // [CAM-3] Espera 'loadedmetadata' + videoWidth>0 (timeout 3s). forceBlack simula
      // preto: 'always' sempre; 'once' só na 1ª tentativa (testa o recupera-no-retry).
      const forceFail = forceBlackRef.current === 'always' ||
        (forceBlackRef.current === 'once' && attempt === 0)
      const ready = await waitForVideoReady(video, 3000, forceFail)

      if (!alive()) { stopCamera(); return } // [#5] guarda pós-await

      if (ready) {
        setIsStreaming(true)
        lastFaceAtRef.current = Date.now() // [watchdog] baseline: começa a contar daqui
        startDetectionLoop()
        startWatchdog()
        return
      }

      // Vídeo PRETO: para e re-adquire UMA vez (contador na PILHA de chamada → sem loop).
      stopCamera()
      if (attempt < 1) return startCamera(attempt + 1)

      // Falhou mesmo após o retry → erro terminal + fallback pro upload (reusa o C3).
      setError('❌ Não foi possível iniciar a câmera.\n\n' +
        'Toque em "Tentar novamente" — ou abra este link no navegador (Chrome/Safari), não no WhatsApp.')
      setShowUploadOption(true)
      setCameraFailed(true)
    } catch (err: any) {
      console.error('Camera error:', err)
      if (!alive()) return
      setError('❌ Erro ao acessar câmera.\n\nUse o upload de foto abaixo.')
      setShowUploadOption(true)
    }
  }

  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current)
    if (watchdogIntervalRef.current) { clearInterval(watchdogIntervalRef.current); watchdogIntervalRef.current = undefined }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setIsStreaming(false)
  }, [])

  // ── Caminho de UPLOAD (mobile, o dominante) — agora GATEADO ──
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('❌ Por favor, selecione um arquivo de imagem.'); input.value = ''; return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('❌ Imagem muito grande. Máximo 10MB.'); input.value = ''; return
    }
    const reader = new FileReader()
    // [UP-min] Sem este handler, uma falha de leitura morria em silêncio (nada acontecia).
    reader.onerror = () => {
      setError('❌ Não consegui ler essa foto. Tire a foto novamente pela câmera.')
      if (typeof window !== 'undefined') window.scrollTo(0, 0)
      input.value = ''
    }
    reader.onload = (e) => {
      const imageData = e.target?.result as string
      const img = new Image()
      // [UP-min] Sem este handler, formato não-decodificável (ex.: HEIC de iPhone/Android)
      // fazia img.onload NUNCA disparar → foto sumia sem mensagem (o pior desfecho de UX).
      img.onerror = () => {
        setError('❌ Não consegui abrir essa foto (formato não suportado). Tire a foto novamente pela câmera.')
        if (typeof window !== 'undefined') window.scrollTo(0, 0)
        input.value = ''
      }
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Redimensiona para ≤800px: ESTA é a imagem submetida E a medida (contrato
        // da régua). NUNCA medir a original do celular (pode ser 3000px → escala
        // errada do gate).
        let width = img.width
        let height = img.height
        const maxSize = 800
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize }
          else { width = Math.round((width / height) * maxSize); height = maxSize }
        }
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        // GATE: 3 medições no MESMO frame; exige rosto na MAIORIA ESTRITA (um
        // falso-positivo do detector não pode liberar foto sem rosto) E
        // interocular ≥ 60. Imagem única é mais sujeita a ruído que a câmera.
        const reads: number[] = []
        const counts: number[] = [] // [UP-min] faceCount por leitura (critério "um rosto")
        let poseKps: { x: number; y: number }[] | null = null
        for (let i = 0; i < 3; i++) {
          const m = await mpDetectFace(canvas)
          counts.push(m.faceCount)
          reads.push(m.faceCount > 0 ? m.interocularPx : 0)
          if (m.faceCount > 0 && m.keypoints) poseKps = m.keypoints
        }
        const v = decideFromReads(reads)
        const ip = v.interocularPx

        // [Fase B] Debug de pose no UPLOAD (mesmo flag ?debugPose=1): calcula e EXIBE
        // yaw/pitch/roll da foto enviada e PARA — NÃO chama onCapture, não grava, não
        // navega. Ignora o gate de tamanho de propósito (a pose interessa mesmo perto
        // do limite). A foto some ao "Tirar Nova Foto". Sem o flag, este bloco não roda
        // e o fluxo abaixo é byte-a-byte idêntico ao de produção.
        if (debugPoseRef.current) {
          const pose = computePose(poseKps)
          setPoseDebug(pose)
          if (!pose) {
            setError('❌ [debugPose] Não detectei rosto para medir a pose. Tire outra foto com o rosto bem visível.')
            input.value = ''
            return
          }
          setError(null)
          setPoseOnly(true)
          setCapturedImage(canvas.toDataURL('image/jpeg', 0.6))
          return
        }

        if (!v.ok) {
          // BLOQUEIO TOTAL: NÃO chama onCapture; mostra o motivo; limpa o input.
          setError(v.reason === 'noFace'
            ? '❌ Não detectei seu rosto na foto. Tire outra com o rosto bem visível e centralizado.'
            : '❌ Rosto muito pequeno/distante. Aproxime o rosto — chegue mais perto na próxima foto.')
          if (typeof window !== 'undefined') window.scrollTo(0, 0) // garante mensagem visível
          input.value = ''
          return
        }

        // [UP-min] VALIDAÇÃO MÍNIMA do UPLOAD (fallback da câmera nativa) — RELAXADA de
        // propósito: a foto da câmera do celular NÃO tem oval-guia nem correção ao vivo,
        // então NÃO exigimos pose (yaw/roll/pitch) nem enquadramento milimétrico — isso
        // travava foto boa e mandava a pessoa de volta pro balcão. Aceitamos se, e só se,
        // há um rosto NÍTIDO e MEDÍVEL, que é o que o Hikvision precisa. Roda SEMPRE no
        // upload (independe de ?poseGate) → fallback grava de forma uniforme.
        //
        // O que a linha 599 (v.ok) já garantiu: rosto na maioria das leituras + interocular
        // ≥ 60 (piso calibrado). E o detector já rejeita coord-lixo na origem
        // (lib/face/detector.ts isSaneDetection + io>frameWidth → faceCount 0). Aqui só
        // reforçamos: OLHOS medíveis e UM rosto (leniente). SEM teto de interocular — rosto
        // grande é ótimo p/ reconhecimento; o "absurdo" já virou faceCount 0 no detector.
        const eyesPresent = !!poseKps && poseKps.length >= 2
        // Leniente (D1): só barra se a MAIORIA das leituras COM rosto viu >1 rosto — um
        // spike transitório de 2ª detecção não bloqueia; o detector já mede o MAIOR rosto.
        const facey = counts.filter((c) => c > 0)
        const multiFace = facey.length > 0 && facey.filter((c) => c > 1).length * 2 > facey.length
        if (!eyesPresent || multiFace) {
          // BLOQUEIO COM MENSAGEM CLARA E VISÍVEL (nada de falha silenciosa). scrollTo(0,0)
          // garante que a caixa de erro apareça (ela renderiza no fluxo rolável, podia cair
          // atrás do rodapé fixo).
          setError(multiFace
            ? '❌ Detectamos mais de um rosto na foto. Envie uma foto só do seu rosto, de frente e bem iluminada.'
            : '❌ Não detectamos um rosto nítido na foto. Envie outra foto do rosto, de frente e bem iluminada.')
          if (typeof window !== 'undefined') window.scrollTo(0, 0)
          input.value = ''
          return
        }

        // Teto de TAMANHO (fonte única em lib/face/size-limit): recomprime em
        // degraus até caber. O 0.6 fixo que estava aqui não bastava — este
        // mesmo caminho produziu 201 KB no celular, e o device recusa.
        const comprimido = compressCanvasToLimit(canvas)
        if (!comprimido.ok) {
          setError('❌ ' + FACE_TOO_LARGE_MESSAGE)
          if (typeof window !== 'undefined') window.scrollTo(0, 0)
          input.value = ''
          return
        }
        const processedImage = comprimido.dataUrl
        const faceData = {
          faceInterocularPx: ip, // medição real (≤800px), p/ a Fatia 5
          faceDetected: true,
          resolution: `${width}x${height}`,
          uploadedFile: true,
          timestamp: new Date().toISOString()
        }
        setCapturedImage(processedImage)
        setTimeout(() => { onCapture(processedImage, faceData) }, 500)
      }
      img.src = imageData
    }
    reader.readAsDataURL(file)
  }

  // Mensagem amigável por motivo (sem jargão técnico)
  const friendly = (reason: FaceReason) =>
    reason === 'noFace' ? 'Não detectei seu rosto. Centralize no oval.'
      : reason === 'tooSmall' ? 'Aproxime o rosto e tente de novo.'
        : ''

  // Captura: SÓ procede com decideFromReads.ok. Não há "capturar mesmo assim".
  const handleCapture = async () => {
    // dupla trava: o botão já só habilita em 'ok', mas revalidamos aqui também
    if (gateStateRef.current !== 'ok' || isCapturing) return
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current) // evita corrida no detector

    setIsCapturing(true)
    setCaptureCountdown(3)
    for (let i = 3; i > 0; i--) {
      setCaptureCountdown(i)
      await new Promise(r => setTimeout(r, 1000))
    }
    setCaptureCountdown(null)

    const frame = buildFrameCanvas() // frame de submissão ≤800px
    if (!frame) { setIsCapturing(false); startDetectionLoop(); return }

    // GATE do frame capturado: 3 medições no MESMO frame; exige rosto na MAIORIA
    // (um único falso-positivo NÃO libera foto sem rosto) E interocular ≥ 60.
    // Mesmo critério do upload (Fatia 4).
    const reads: number[] = []
    let poseKps: { x: number; y: number }[] | null = null
    let captureBbox: { x: number; y: number; w: number; h: number } | null = null // [C2-b]
    for (let i = 0; i < 3; i++) {
      const m = await mpDetectFace(frame)
      reads.push(m.faceCount > 0 ? m.interocularPx : 0)
      if (m.faceCount > 0 && m.keypoints) poseKps = m.keypoints
      if (m.faceCount > 0 && m.bbox) captureBbox = m.bbox
    }
    const v = decideFromReads(reads)
    const ip = v.interocularPx

    if (!v.ok) {
      // NÃO captura — feedback e volta ao preview
      setError(v.reason === 'noFace'
        ? 'Não detectei seu rosto. Centralize no oval e tente de novo.'
        : friendly(v.reason))
      setIsCapturing(false)
      startDetectionLoop()
      return
    }

    // [C1+C2-b] POSE + ENQUADRAMENTO no INSTANTE da captura (mesma regra do gate ao
    // vivo, via decideCapture: yaw+roll+bbox, pitch fora). Fecha o furo do countdown
    // de 3s — se a pessoa virar/descentrar durante a contagem, a distância passa mas
    // o gate combinado barra. SÓ com ?poseGate=1 → sem a flag, handleCapture segue
    // byte-a-byte como hoje (só distância). prev='ok' pois o botão só habilitou com
    // o gate ao vivo já em 'ok' (re-check tolerante).
    if (poseGateRef.current) {
      const gateReason = decideCapture({
        distanceReason: 'ok',
        pose: computePose(poseKps),
        bbox: captureBbox ?? undefined,
        frameW: frame.width,
        frameH: frame.height,
        mirrored: false
      }, 'ok')
      if (gateReason !== 'ok') {
        setError(captureMsg(gateReason))
        setIsCapturing(false)
        startDetectionLoop()
        return
      }
    }

    // Teto de TAMANHO — mesmo helper do caminho de upload (fonte única).
    const comprimido = compressCanvasToLimit(frame)
    if (!comprimido.ok) {
      setError('❌ ' + FACE_TOO_LARGE_MESSAGE)
      setIsCapturing(false)
      startDetectionLoop()
      return
    }
    const imageData = comprimido.dataUrl
    setCapturedImage(imageData)
    stopCamera()
    const faceData = {
      faceInterocularPx: ip, // medição real p/ a Fatia 5
      faceDetected: true,
      resolution: `${frame.width}x${frame.height}`,
      timestamp: new Date().toISOString()
    }
    setTimeout(() => { onCapture(imageData, faceData) }, 800)
  }

  const retryCapture = () => {
    setCapturedImage(null)
    setIsCapturing(false)
    setError(null)
    setPoseOnly(false)
    startCamera()
  }

  // [assim-mesmo] Fallback do device com MediaPipe MORTO (vídeo OK, mas o detector nunca
  // acha rosto → oval fica vermelho pra sempre). Revelado só após o watchdog (25s) e só com
  // vídeo vivo. Captura o frame ATUAL do <video> DIRETO (mesma régua ≤800px / q0.7 da captura
  // normal), SEM mpDetectFace, bypassando o gate e a re-detecção. Grava faceInterocularPx=null
  // (honesto: nunca medido) + faceDetected:false (o servidor marca __faceUnvalidated p/
  // conferência). Se buildFrameCanvas() vier null (câmera PRETA), não há frame → orienta o
  // upload da nativa (fallback do CAM-3).
  const captureAnyway = () => {
    const frame = buildFrameCanvas()
    if (!frame) {
      // Vídeo virou preto (videoWidth 0): não há frame p/ capturar. Para a câmera →
      // isStreaming false → o layout cai no fallback de câmera-preta (upload da nativa).
      stopCamera()
      setError('❌ A câmera parou de funcionar. Toque em "Enviar uma foto do celular" abaixo.')
      setShowUploadOption(true)
      return
    }
    // Teto de TAMANHO também aqui: este caminho pula o gate de rosto, mas o
    // device recusa por peso do mesmo jeito. Deixar passar só adiaria a falha
    // para o sync, longe de quem poderia tirar outra foto.
    const comprimido = compressCanvasToLimit(frame)
    if (!comprimido.ok) {
      setError('❌ ' + FACE_TOO_LARGE_MESSAGE)
      return
    }
    const imageData = comprimido.dataUrl
    setCapturedImage(imageData)
    stopCamera()
    const faceData = {
      faceInterocularPx: null, // nunca medido (detector morto) — sentinela honesto
      faceDetected: false,     // → servidor marca __faceUnvalidated (conferência)
      unvalidated: true,
      resolution: `${frame.width}x${frame.height}`,
      timestamp: new Date().toISOString()
    }
    setTimeout(() => { onCapture(imageData, faceData) }, 500)
  }

  useEffect(() => {
    startCamera()
    // [CAM-1] Libera a câmera no reload/fechar/navegação. `pagehide` (não `beforeunload`,
    // não-confiável no mobile) cobre reload/close/bfcache — era o gap que deixava o stream
    // preso e a próxima abertura vinha PRETA (agravado pelo webview do WhatsApp). stopCamera
    // é idempotente (guarda em streamRef + clearInterval seguro), então disparo concorrente
    // com um startCamera legítimo não causa double-stop/erro.
    window.addEventListener('pagehide', stopCamera)
    return () => {
      window.removeEventListener('pagehide', stopCamera)
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera])

  // [C1] okState vem do reason combinado. Com ?poseGate=1 inclui pose; sem a flag,
  // liveReason == gateState (distância) → idêntico ao comportamento de hoje.
  const okState = liveReason === 'ok'

  // [assim-mesmo/layout] Estado "MediaPipe morto, vídeo VIVO": o watchdog ofereceu o
  // fallback mas a câmera segue no ar. SÓ neste estado os controles vão pro FLUXO abaixo
  // do vídeo e a barra fixa some (nada sobrepõe o vídeo). Normal (oval verde) e câmera
  // preta (!isStreaming) têm fallbackLive=false → barra fixa IDÊNTICA.
  const fallbackLive = isStreaming && showUploadOption && !capturedImage

  return (
    <>
      {/* [assim-mesmo/layout] Sem barra fixa no fallbackLive → dispensa a folga pb-44 */}
      <div className={`space-y-4 ${fallbackLive ? 'pb-8' : 'pb-44'}`}>
        {/* [D-lite] Caixa RETRATO 3:4 = mesmo aspecto do vídeo do celular (600×800) → o
            object-cover não corta mais o queixo/testa. Largura capada por 46svh (→ altura
            ~61svh) pra caber acima do rodapé fixo em telas curtas; w-full em telas estreitas.
            NÃO afeta gate/distância/enquadramento (tudo buffer, não display). */}
        <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-[3/4] w-full max-w-[46svh] mx-auto">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Indicador de estado (suave, sem piscar — histerese no gate) */}
            {isStreaming && (
              <div className="absolute top-4 left-4 right-4 flex justify-center">
                <div className="bg-black bg-opacity-50 rounded-lg px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${okState ? 'bg-green-500' : (liveReason === 'tooSmall' || liveReason === 'tooBig' || liveReason === 'offCenter' || liveReason === 'cutOff') ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <span className="text-white text-xs">
                      {captureMsg(msgReason)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* [Fase A/B] Overlay de debug (só com ?debugPose=1) — conteúdo escrito
                IMPERATIVAMENTE pelo loop (innerHTML no ref), sem re-render por frame. */}
            {showPoseDebug && <DebugOverlaySink innerRef={liveDebugRef} />}

            {/* Guia central enquanto não está ok */}
            {isStreaming && !okState && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                  {liveReason === 'tooSmall' ? 'Aproxime um pouco' : liveReason === 'tooBig' ? 'Afaste um pouco' : 'Enquadre o rosto no oval, sem colar'}
                </span>
              </div>
            )}

            {captureCountdown && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="text-white text-6xl font-bold animate-pulse">{captureCountdown}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
            {/* [Fase B] Pose da foto enviada (só com ?debugPose=1 no caminho de upload) */}
            {showPoseDebug && poseOnly && poseDebug && (
              <div className="absolute top-2 left-2 bg-black/70 text-green-300 text-[11px] font-mono px-2 py-1 rounded leading-tight z-10">
                <div>yaw: {poseDebug.yaw.toFixed(3)}</div>
                <div>pitch: {poseDebug.pitch.toFixed(3)}</div>
                <div>roll: {poseDebug.roll.toFixed(1)}°</div>
              </div>
            )}
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-4xl mb-2">{poseOnly ? '📐' : '✅'}</div>
                <p className="text-lg font-semibold text-gray-800">{poseOnly ? 'Pose medida (nada salvo)' : 'Foto capturada!'}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* [assim-mesmo/layout] MediaPipe morto + vídeo VIVO: controles EM FLUXO abaixo do
          vídeo (rolam se não couberem, NUNCA sobrepõem). Vídeo fica limpo no topo com
          oval+status. Barra fixa suprimida neste estado (ver {!fallbackLive} lá embaixo). */}
      {fallbackLive && (
        <div className="space-y-3">
          <button
            onClick={captureAnyway}
            className="w-full py-4 bg-amber-500 text-white rounded-xl font-semibold text-base hover:bg-amber-600 transition-all duration-200 shadow-md active:scale-95"
          >
            📷 Tirar foto mesmo assim
          </button>
          <p className="text-sm text-white/70 text-center px-2">
            A câmera não conseguiu reconhecer seu rosto, mas você pode tirar a foto assim mesmo.
          </p>
          {/* Escape secundário (câmera-preta): nativa como LINK discreto, não botão */}
          <div className="text-center pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-white/60 underline hover:text-white/90 transition-colors"
            >
              Ainda com dificuldade? Enviar uma foto do celular
            </button>
          </div>
          {onBack && (
            <div className="text-center pt-2">
              <button
                onClick={onBack}
                disabled={isCapturing}
                className="text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                ← Voltar
              </button>
            </div>
          )}
        </div>
      )}

      {/* [D-lite] Dicas SÓ quando a câmera NÃO está ativa (ex.: fallback/upload). Durante o
          streaming, o oval + a mensagem de status já guiam; o painel só empurraria o botão
          "Capturar" pra baixo da dobra na caixa retrato (mais alta). */}
      {!capturedImage && !isStreaming && (
        <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
          <h3 className="font-semibold text-white text-sm mb-2">📝 Dicas para melhor foto:</h3>
          <ul className="text-sm text-white/80 space-y-1">
            <li>• Enquadre o rosto no oval — <strong>sem colar</strong> (distância confortável, um braço)</li>
            <li>• Procure um local com boa iluminação</li>
            <li>• Evite contraluz (janela atrás)</li>
            <li>• Mantenha expressão neutra</li>
          </ul>
          <p className="text-xs text-verde-agua mt-2 font-semibold">
            💡 O botão libera quando o oval ficar verde.
          </p>
        </div>
      )}

      {/* Erro/Info */}
      {error && (
        <div className={`px-4 py-3 rounded-xl ${
          error.includes('Use a câmera do seu celular')
            ? 'bg-white/10 backdrop-blur-sm border border-azul-medio/40 text-white/90'
            : 'bg-red-900/30 backdrop-blur-sm border border-red-400/40 text-red-200'
        }`}>
          <pre className="whitespace-pre-wrap font-sans text-sm">{error}</pre>
        </div>
      )}

      </div>{/* fim do conteúdo em fluxo (rolável) */}

      {/* Barra de ações FIXA no rodapé da viewport (fora do scroll): o botão de
          captura fica SEMPRE visível, independente da barra de endereço/gestos.
          pb com env(safe-area-inset-bottom) limpa a barra de gestos do Android.
          Não há ancestral com transform nesta tela, então fixed = relativo à
          viewport (o conteúdo acima tem pb-44 p/ não ficar escondido atrás).
          [assim-mesmo] Suprimida SÓ no fallbackLive (controles no fluxo acima, sem sobrepor
          o vídeo). Normal/oval-verde e câmera-preta (!isStreaming) mantêm a barra IDÊNTICA. */}
      {!fallbackLive && (
      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-azul-marinho via-azul-marinho/95 to-transparent">
        <div className="max-w-md mx-auto space-y-3">
        {!capturedImage ? (
          <>
            {/* Captura: habilita SÓ com gate ok. Sem "capturar mesmo assim". */}
            {isStreaming && (
              <button
                onClick={handleCapture}
                disabled={isCapturing || !okState}
                className={`w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-md active:scale-95 ${
                  okState && !isCapturing
                    ? 'bg-verde-agua text-white hover:bg-verde-agua-dark glow-verde-agua'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {isCapturing ? '⏳ Capturando...' :
                  okState ? '📸 Capturar Foto' :
                    liveReason === 'tooSmall' ? '👤 Aproxime o rosto' :
                      liveReason === 'tooBig' ? '👤 Afaste um pouco o rosto' :
                      liveReason === 'tilt' ? '🙂 Endireite a cabeça' :
                        (liveReason === 'turnLeft' || liveReason === 'turnRight') ? '🙂 Vire o rosto pra frente' :
                          liveReason === 'cutOff' ? '👤 Enquadre o rosto no círculo' :
                            liveReason === 'offCenter' ? '👤 Centralize o rosto' :
                              '👤 Centralize seu rosto'}
              </button>
            )}

            {/* [CAM-3] Erro terminal de câmera: reinicia o ciclo limpo (startCamera(0)) */}
            {cameraFailed && (
              <button
                onClick={() => startCamera(0)}
                className="w-full py-4 bg-azul-medio text-white rounded-xl font-semibold hover:bg-azul-medio-dark transition-all duration-200"
              >
                🔄 Tentar novamente
              </button>
            )}

            {/* [assim-mesmo] O botão âmbar "Tirar foto mesmo assim" (vídeo vivo + watchdog)
                foi movido PRA CIMA, no fluxo abaixo do vídeo (bloco fallbackLive) — aqui na
                barra fixa ele sobrepunha o vídeo. */}

            {(showUploadOption || !isStreaming) && (
              <>
                {/* [watchdog] Mensagem suave do soft-offer (câmera segue tentando) */}
                {uploadHint && (
                  <div className="bg-amber-400/10 border border-amber-300/30 p-3 rounded-xl text-center">
                    <p className="text-sm text-white/90">💡 {uploadHint}</p>
                  </div>
                )}
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 bg-verde-agua text-white rounded-xl font-semibold text-base hover:bg-verde-agua-dark transition-all duration-200 shadow-md active:scale-95 glow-verde-agua"
                  >
                    📸 Abrir Câmera e Tirar Foto
                  </button>
                </div>

                <div className="bg-verde-agua/10 p-3 rounded-xl text-center border border-verde-agua/20">
                  <p className="text-xs text-white/80">
                    ✅ Este botão abrirá a câmera nativa do seu celular para tirar a foto
                  </p>
                </div>
              </>
            )}

            {onBack && (
              <button
                onClick={onBack}
                disabled={isCapturing}
                className="w-full py-4 bg-white/10 text-white border border-white/20 rounded-xl font-semibold hover:bg-white/20 transition-all duration-200"
              >
                ← Voltar
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={retryCapture}
              className="w-full py-4 bg-azul-medio text-white rounded-xl font-semibold hover:bg-azul-medio-dark transition-all duration-200"
            >
              🔄 Tirar Nova Foto
            </button>
            <p className="text-center text-sm text-white/60">{poseOnly ? 'Modo debug de pose — nada foi salvo' : 'Processando... Aguarde'}</p>
          </>
        )}
        </div>
      </div>
      )}
    </>
  )
}
