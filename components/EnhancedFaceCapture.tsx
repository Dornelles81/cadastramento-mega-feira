'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { detectFace as mpDetectFace, decideFromReads, nextGateState, type FaceReason } from '../lib/face/detector'
import { computePose, type Pose } from '../lib/face/pose'
import { decideCapture, DEFAULT_FRAMING_THRESHOLDS, type CaptureReason } from '../lib/face/gate'

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
  fw: number; fh: number // [C3.1] dimensões do frame medido (buffer do vídeo, ≤800)
}

const DETECT_MS = 250 // intervalo do loop de detecção ao vivo
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
const OVAL_RADIUS_Y = 0.32 // raio vertical: fração da ALTURA EXIBIDA da caixa
const OVAL_ASPECT = 0.75   // largura/altura do oval NA TELA (formato rosto)
const OVAL_MAX_RX = 0.44   // clamp: raio horizontal ≤ fração da largura exibida

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
  const gateStateRef = useRef<FaceReason>('noFace') // espelha gateState p/ o loop/captura
  const detectingRef = useRef(false) // guarda contra detecção concorrente
  const [showUploadOption, setShowUploadOption] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // [Fase A] Debug de pose (yaw/pitch/roll) atrás do flag ?debugPose=1 — SÓ EXIBE,
  // não afeta o gate nem a habilitação do botão. Sem o flag, o fluxo é idêntico.
  const debugPoseRef = useRef(false)
  const [showPoseDebug, setShowPoseDebug] = useState(false)
  const [poseDebug, setPoseDebug] = useState<Pose | null>(null)
  const [frameDebug, setFrameDebug] = useState<FrameDebug | null>(null) // [C2-a] enquadramento (só overlay)
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

  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const on = params?.get('debugPose') === '1'
    debugPoseRef.current = on
    setShowPoseDebug(on)
    poseGateRef.current = params?.get('poseGate') === '1'
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
      : (state === 'tooSmall' || state === 'offCenter' || state === 'cutOff') ? '#eab308'
        : '#ef4444'
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.setLineDash([14, 9])
    ctx.beginPath()
    // [C3.1] Raios no espaço EXIBIDO (proporção de rosto fixa na tela) → buffer.
    // clientWidth/Height = tamanho CSS da caixa; oc.width/height = buffer do vídeo.
    const dispW = oc.clientWidth || oc.width
    const dispH = oc.clientHeight || oc.height
    let ryDisp = OVAL_RADIUS_Y * dispH
    let rxDisp = ryDisp * OVAL_ASPECT
    if (rxDisp > OVAL_MAX_RX * dispW) { // caixa estreita: encolhe mantendo a proporção
      rxDisp = OVAL_MAX_RX * dispW
      ryDisp = rxDisp / OVAL_ASPECT
    }
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

  // [C2-a] Formata número com sinal (+0.03 / −0.12) p/ o desvio do alvo no overlay.
  const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2)

  // Texto do indicador por reason (tabela da Fase C). turn* → frase NEUTRA (achado
  // MIRROR: não arriscar direção).
  const captureMsg = (r: CaptureReason): string =>
    r === 'ok' ? 'Rosto OK ✓'
      : r === 'tooSmall' ? 'Aproxime o rosto'
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
      const frame = buildFrameCanvas()
      if (!frame) return
      const m = await mpDetectFace(frame)
      // [C1] Pose calculada a CADA frame (barato) — alimenta o overlay de debug E
      // o gate combinado (quando ?poseGate=1). Sem rosto/keypoints → null.
      const pose = m.faceCount > 0 && m.keypoints ? computePose(m.keypoints) : null
      if (debugPoseRef.current) {
        setPoseDebug(pose)
        // [C2-a] Overlay de enquadramento (SÓ display — o gate usa o mesmo bbox via
        // decideCapture abaixo, C2-b). Δalvo = desvio do ALVO DO BBOX (gate.ts
        // DEFAULT_FRAMING_THRESHOLDS = 0.50/0.65 — fonte única). O oval visual fica mais alto.
        if (m.faceCount > 0 && m.bbox) {
          const W = frame.width, H = frame.height, bb = m.bbox
          const cx = (bb.x + bb.w / 2) / W, cy = (bb.y + bb.h / 2) / H
          setFrameDebug({
            cx, cy, dx: cx - DEFAULT_FRAMING_THRESHOLDS.centerX, dy: cy - DEFAULT_FRAMING_THRESHOLDS.centerY,
            l: bb.x / W, r: (W - (bb.x + bb.w)) / W, t: bb.y / H, b: (H - (bb.y + bb.h)) / H,
            bx: bb.x, by: bb.y, bw: bb.w, bh: bb.h,
            fw: W, fh: H
          })
        } else setFrameDebug(null)
      }
      // SEM ROSTO = no_face IMEDIATO: zera a janela da mediana e cai pro vermelho
      // na hora, SEM suavização. A mediana/histerese só vale p/ o tamanho
      // (tooSmall↔ok) com rosto presente — nunca pode segurar 'ok' verde depois
      // que o rosto saiu do quadro (era o furo: o verde segurava ~500ms).
      if (m.faceCount === 0) {
        historyRef.current = []
        if (gateStateRef.current !== 'noFace') { gateStateRef.current = 'noFace'; setGateState('noFace') }
        applyReason('noFace')
        return
      }
      const hist = historyRef.current
      hist.push(m.interocularPx)
      if (hist.length > 8) hist.shift()
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

  // Inicia a câmera (com detecção de HTTP → fallback p/ upload nativo)
  const startCamera = async () => {
    try {
      setError(null)
      historyRef.current = []
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsStreaming(true)
        startDetectionLoop()
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setError('❌ Erro ao acessar câmera.\n\nUse o upload de foto abaixo.')
      setShowUploadOption(true)
    }
  }

  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current)
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
    reader.onload = (e) => {
      const imageData = e.target?.result as string
      const img = new Image()
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
        let poseKps: { x: number; y: number }[] | null = null
        let uploadBbox: { x: number; y: number; w: number; h: number } | null = null // [C3]
        for (let i = 0; i < 3; i++) {
          const m = await mpDetectFace(canvas)
          reads.push(m.faceCount > 0 ? m.interocularPx : 0)
          if (m.faceCount > 0 && m.keypoints) poseKps = m.keypoints
          if (m.faceCount > 0 && m.bbox) uploadBbox = m.bbox
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
          input.value = ''
          return
        }

        // [C3] POSE + ENQUADRAMENTO no UPLOAD (mesma regra da câmera, via decideCapture:
        // yaw+roll+bbox, pitch fora). Veredito ÚNICO por foto — não há estado anterior,
        // então prev='ok' (limiar tolerante/relaxado da histerese: bloqueia só além de
        // base+hyst — os mesmos cortes efetivos 0.30 yaw / 13° roll / dx 0.12 da câmera).
        // MIRROR: mirrored:false — a foto do upload é medida E exibida SEM espelho (o
        // sinal do yaw inverte vs PC, mas os limiares são |valor| e a frase é neutra).
        // SÓ com ?poseGate=1 → sem a flag, o upload segue byte-a-byte como hoje.
        if (poseGateRef.current) {
          const gateReason = decideCapture({
            distanceReason: 'ok',
            pose: computePose(poseKps),
            bbox: uploadBbox ?? undefined,
            frameW: width,
            frameH: height,
            mirrored: false
          }, 'ok')
          if (gateReason !== 'ok') {
            // REJEITA o envio: não grava nada; a pessoa tira outra foto.
            setError(`❌ ${captureMsg(gateReason)}. Tire outra foto.`)
            input.value = ''
            return
          }
        }

        const processedImage = canvas.toDataURL('image/jpeg', 0.6)
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

    const imageData = frame.toDataURL('image/jpeg', 0.7)
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

  useEffect(() => {
    startCamera()
    return () => { stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera])

  // [C1] okState vem do reason combinado. Com ?poseGate=1 inclui pose; sem a flag,
  // liveReason == gateState (distância) → idêntico ao comportamento de hoje.
  const okState = liveReason === 'ok'

  return (
    <>
      <div className="space-y-4 pb-44">
        <div className="relative bg-gray-900 rounded-xl overflow-hidden h-[42svh] max-h-[420px] min-h-[220px] mx-auto">
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
                    <div className={`w-2 h-2 rounded-full ${okState ? 'bg-green-500' : (liveReason === 'tooSmall' || liveReason === 'offCenter' || liveReason === 'cutOff') ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <span className="text-white text-xs">
                      {captureMsg(msgReason)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* [Fase A] Overlay de debug de pose (só com ?debugPose=1) — apenas exibe
                os números; não afeta o gate nem a captura. */}
            {showPoseDebug && (
              <div className="absolute top-16 left-2 bg-black/70 text-green-300 text-[11px] font-mono px-2 py-1 rounded leading-tight z-10">
                <div>yaw: {poseDebug ? poseDebug.yaw.toFixed(3) : '—'}</div>
                <div>pitch: {poseDebug ? poseDebug.pitch.toFixed(3) : '—'}</div>
                <div>roll: {poseDebug ? poseDebug.roll.toFixed(1) + '°' : '—'}</div>
                {/* [C2-a] Enquadramento — alvo bbox 0.50/0.65; oval visual 0.50/0.58 */}
                <div className="mt-1 border-t border-green-300/30 pt-1">
                  c: {frameDebug ? `${frameDebug.cx.toFixed(2)},${frameDebug.cy.toFixed(2)}` : '—'}
                </div>
                <div>Δalvo: {frameDebug ? `${fmtSigned(frameDebug.dx)},${fmtSigned(frameDebug.dy)}` : '—'}</div>
                <div>folga L{frameDebug ? frameDebug.l.toFixed(2) : '—'} R{frameDebug ? frameDebug.r.toFixed(2) : '—'}</div>
                <div>folga T{frameDebug ? frameDebug.t.toFixed(2) : '—'} B{frameDebug ? frameDebug.b.toFixed(2) : '—'}</div>
                <div className="text-green-300/60">bbox: {frameDebug ? `${frameDebug.bx},${frameDebug.by} ${frameDebug.bw}×${frameDebug.bh}` : '—'}</div>
                {/* [C3.1] frame real do vídeo (buffer ≤800) — crava a geometria no celular */}
                <div className="text-green-300/60">frame: {frameDebug ? `${frameDebug.fw}×${frameDebug.fh}` : '—'}</div>
              </div>
            )}

            {/* Guia central enquanto não está ok */}
            {isStreaming && !okState && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                  {gateState === 'tooSmall' ? 'Chegue mais perto da câmera' : 'Deixe seu rosto preencher o oval'}
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

      {/* Instruções — só quando o rosto NÃO está ok (quando verde, o foco é o
          botão; as dicas só atrapalhariam e empurram o botão pra baixo da dobra). */}
      {!capturedImage && !okState && (
        <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
          <h3 className="font-semibold text-white text-sm mb-2">📝 Dicas para melhor foto:</h3>
          <ul className="text-sm text-white/80 space-y-1">
            <li>• Deixe seu rosto preencher o oval (chegue perto)</li>
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
          viewport (o conteúdo acima tem pb-44 p/ não ficar escondido atrás). */}
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
                      liveReason === 'tilt' ? '🙂 Endireite a cabeça' :
                        (liveReason === 'turnLeft' || liveReason === 'turnRight') ? '🙂 Vire o rosto pra frente' :
                          liveReason === 'cutOff' ? '👤 Enquadre o rosto no círculo' :
                            liveReason === 'offCenter' ? '👤 Centralize o rosto' :
                              '👤 Centralize seu rosto'}
              </button>
            )}

            {(showUploadOption || !isStreaming) && (
              <>
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
    </>
  )
}
