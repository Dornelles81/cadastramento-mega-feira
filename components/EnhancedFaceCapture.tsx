'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { detectFace as mpDetectFace, decideFromReads, nextGateState, type FaceReason } from '../lib/face/detector'

interface EnhancedFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

const DETECT_MS = 250 // intervalo do loop de detecção ao vivo

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

  // Desenha o oval-guia colorido pelo estado do gate.
  const drawOval = (state: FaceReason) => {
    const video = videoRef.current
    const oc = canvasRef.current
    if (!video || !oc || !video.videoWidth) return
    oc.width = video.videoWidth; oc.height = video.videoHeight
    const ctx = oc.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, oc.width, oc.height)
    const color = state === 'ok' ? '#22c55e' : state === 'tooSmall' ? '#eab308' : '#ef4444'
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.setLineDash([14, 9])
    ctx.beginPath()
    ctx.ellipse(oc.width / 2, oc.height * 0.45, oc.width * 0.30, oc.height * 0.34, 0, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Loop de detecção ao vivo: mede no frame redimensionado, suaviza (mediana +
  // histerese) e atualiza o estado do gate + o oval. Sem heurística de pele.
  const runDetection = useCallback(async () => {
    if (detectingRef.current) return
    detectingRef.current = true
    try {
      const frame = buildFrameCanvas()
      if (!frame) return
      const m = await mpDetectFace(frame)
      // SEM ROSTO = no_face IMEDIATO: zera a janela da mediana e cai pro vermelho
      // na hora, SEM suavização. A mediana/histerese só vale p/ o tamanho
      // (tooSmall↔ok) com rosto presente — nunca pode segurar 'ok' verde depois
      // que o rosto saiu do quadro (era o furo: o verde segurava ~500ms).
      if (m.faceCount === 0) {
        historyRef.current = []
        if (gateStateRef.current !== 'noFace') { gateStateRef.current = 'noFace'; setGateState('noFace') }
        drawOval('noFace')
        return
      }
      const hist = historyRef.current
      hist.push(m.interocularPx)
      if (hist.length > 8) hist.shift()
      const next = nextGateState(hist, gateStateRef.current)
      if (next !== gateStateRef.current) { gateStateRef.current = next; setGateState(next) }
      drawOval(next)
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
        for (let i = 0; i < 3; i++) {
          const m = await mpDetectFace(canvas)
          reads.push(m.faceCount > 0 ? m.interocularPx : 0)
        }
        const v = decideFromReads(reads)
        const ip = v.interocularPx

        if (!v.ok) {
          // BLOQUEIO TOTAL: NÃO chama onCapture; mostra o motivo; limpa o input.
          setError(v.reason === 'noFace'
            ? '❌ Não detectei seu rosto na foto. Tire outra com o rosto bem visível e centralizado.'
            : '❌ Rosto muito pequeno/distante. Aproxime o rosto — chegue mais perto na próxima foto.')
          input.value = ''
          return
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
    for (let i = 0; i < 3; i++) {
      const m = await mpDetectFace(frame)
      reads.push(m.faceCount > 0 ? m.interocularPx : 0)
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
    startCamera()
  }

  useEffect(() => {
    startCamera()
    return () => { stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera])

  const okState = gateState === 'ok'

  return (
    <div className="space-y-4">
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
                    <div className={`w-2 h-2 rounded-full ${okState ? 'bg-green-500' : gateState === 'tooSmall' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <span className="text-white text-xs">
                      {okState ? 'Rosto OK ✓' : gateState === 'tooSmall' ? 'Aproxime o rosto' : 'Centralize seu rosto'}
                    </span>
                  </div>
                </div>
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
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-lg font-semibold text-gray-800">Foto capturada!</p>
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

      {/* Ações — câmera com altura em svh (área REALMENTE visível, já desconta a
          barra de endereço do mobile; vh contaria a área sob a barra e estouraria)
          + dicas escondidas quando ok => câmera e botão cabem juntos sem rolar,
          sem precisar de fixed/sticky (que seriam frágeis pelos transforms). */}
      <div className="space-y-3">
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
                    gateState === 'tooSmall' ? '👤 Aproxime o rosto' :
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
            <p className="text-center text-sm text-white/60">Processando... Aguarde</p>
          </>
        )}
      </div>
    </div>
  )
}
