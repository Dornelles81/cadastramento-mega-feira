'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface SimpleFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

export default function SimpleFaceCapture({ onCapture, onBack }: SimpleFaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start camera stream
  const startCamera = async () => {
    try {
      setError(null)
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available in your browser')
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsStreaming(true)
        setCameraPermission('granted')
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setCameraPermission('denied')
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Acesso à câmera negado. Por favor, permita o acesso à câmera nas configurações do navegador.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('Nenhuma câmera encontrada. Verifique se sua câmera está conectada.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Câmera já está sendo usada por outro aplicativo.')
      } else {
        setError('Não foi possível acessar a câmera. Erro: ' + err.message)
      }
    }
  }

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  // Capture current frame
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context || !video.videoWidth) return null

    // Set canvas size to video size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas (flipped for mirror effect)
    context.save()
    context.scale(-1, 1)
    context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
    context.restore()

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.9)
    return imageData
  }, [])

  // Handle photo capture
  const handleCapture = async () => {
    setIsCapturing(true)
    setCaptureCountdown(3)

    // Countdown
    for (let i = 3; i > 0; i--) {
      setCaptureCountdown(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    setCaptureCountdown(null)

    // Capture final image
    const imageData = await captureFrame()
    if (imageData) {
      setCapturedImage(imageData)
      stopCamera()
      
      // Create mock face data for compatibility
      const mockFaceData = {
        faceId: 'capture-' + Date.now(),
        faceRectangle: {
          top: 100,
          left: 150,
          width: 200,
          height: 200
        },
        faceQuality: {
          score: 0.85,
          isGoodQuality: true
        }
      }
      
      // Small delay to show captured image
      setTimeout(() => {
        onCapture(imageData, mockFaceData)
      }, 1000)
    } else {
      setError('Erro ao capturar imagem. Tente novamente.')
      setIsCapturing(false)
    }
  }

  // Retry capture
  const retryCapture = () => {
    setCapturedImage(null)
    setIsCapturing(false)
    startCamera()
  }

  // Initialize camera on mount
  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return (
    <div className="space-y-4">
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[4/3]">
        {/* Show video or captured image */}
        {!capturedImage ? (
          <>
            {/* Video element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            
            {/* Face guide overlay */}
            {isStreaming && (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="w-full h-full">
                  <ellipse
                    cx="50%"
                    cy="45%"
                    rx="25%"
                    ry="35%"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="2"
                    strokeDasharray="10 5"
                  />
                </svg>
                <div className="absolute top-4 left-0 right-0 text-center">
                  <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                    Posicione seu rosto dentro do oval
                  </span>
                </div>
              </div>
            )}

            {/* Countdown overlay */}
            {captureCountdown && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="text-white text-6xl font-bold animate-pulse">
                  {captureCountdown}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Captured image */}
            <img 
              src={capturedImage} 
              alt="Captured" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-lg font-semibold text-gray-800">Foto capturada!</p>
              </div>
            </div>
          </>
        )}
        
        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Status overlay */}
        {!capturedImage && (
          <div className="absolute top-4 right-4">
            <div className="bg-black bg-opacity-50 rounded-lg px-3 py-2 text-white">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <span className="text-xs">
                  {isStreaming ? 'Câmera ativa' : 'Câmera inativa'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Camera permission denied */}
        {cameraPermission === 'denied' && !capturedImage && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <div className="text-4xl mb-4">📷</div>
              <h3 className="text-lg font-semibold mb-2">Câmera não autorizada</h3>
              <p className="text-sm text-gray-400 mb-4">
                Por favor, autorize o acesso à câmera nas configurações do navegador
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-mega-500 text-white rounded hover:bg-mega-600"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {!capturedImage && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">📝 Instruções:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Posicione seu rosto no centro da tela</li>
            <li>• Mantenha boa iluminação</li>
            <li>• Remova óculos escuros se estiver usando</li>
            <li>• Olhe diretamente para a câmera</li>
            <li>• Clique em capturar quando estiver pronto</li>
          </ul>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {!capturedImage ? (
          <>
            <button
              onClick={handleCapture}
              disabled={!isStreaming || isCapturing}
              className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCapturing ? '⏳ Capturando...' : '📸 Capturar Foto'}
            </button>

            {onBack && (
              <button
                onClick={onBack}
                disabled={isCapturing}
                className="w-full py-4 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                ← Voltar
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={retryCapture}
              className="w-full py-4 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors"
            >
              🔄 Tirar Nova Foto
            </button>
            <p className="text-center text-sm text-gray-600">
              Processando... Aguarde um momento
            </p>
          </>
        )}
      </div>
    </div>
  )
}