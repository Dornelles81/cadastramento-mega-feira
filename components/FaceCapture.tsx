'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface FaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

interface FaceDetectionResult {
  faceId: string
  faceRectangle: {
    top: number
    left: number
    width: number
    height: number
  }
  faceAttributes?: {
    age?: number
    gender?: string
    smile?: number
    facialHair?: any
    glasses?: string
    emotion?: any
    blur?: any
    exposure?: any
    noise?: any
    occlusion?: any
  }
  faceLandmarks?: any
  recognitionModel?: string
  faceQuality?: {
    score: number
    isGoodQuality: boolean
  }
}

export default function FaceCapture({ onCapture, onBack }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [facesDetected, setFacesDetected] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [faceBox, setFaceBox] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  // Start camera stream
  const startCamera = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsStreaming(true)
        setCameraPermission('granted')
      }
    } catch (err) {
      console.error('Camera error:', err)
      setCameraPermission('denied')
      setError('Não foi possível acessar a câmera. Verifique as permissões.')
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

  // Detect faces using Azure Face API
  const detectFaces = async (imageData: string): Promise<FaceDetectionResult[]> => {
    try {
      setIsAnalyzing(true)
      const response = await fetch('/api/azure/detect-face', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imageData })
      })

      if (!response.ok) {
        throw new Error('Failed to detect faces')
      }

      const faces = await response.json()
      return faces
    } catch (error) {
      console.error('Face detection error:', error)
      return []
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Capture current frame
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return null

    // Set canvas size to video size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.95)
    return imageData
  }, [])

  // Continuous face detection
  useEffect(() => {
    if (!isStreaming) return

    const detectInterval = setInterval(async () => {
      if (isCapturing || isAnalyzing) return

      const imageData = await captureFrame()
      if (imageData) {
        const faces = await detectFaces(imageData)
        setFacesDetected(faces.length)
        
        if (faces.length === 1) {
          const face = faces[0]
          // Update face box for visual feedback
          if (videoRef.current) {
            const video = videoRef.current
            const scaleX = video.offsetWidth / video.videoWidth
            const scaleY = video.offsetHeight / video.videoHeight
            
            setFaceBox({
              left: face.faceRectangle.left * scaleX,
              top: face.faceRectangle.top * scaleY,
              width: face.faceRectangle.width * scaleX,
              height: face.faceRectangle.height * scaleY
            })
          }
        } else {
          setFaceBox(null)
        }
      }
    }, 1000) // Check every second

    return () => clearInterval(detectInterval)
  }, [isStreaming, isCapturing, isAnalyzing, captureFrame])

  // Handle photo capture
  const handleCapture = async () => {
    if (facesDetected !== 1) {
      setError('Por favor, certifique-se de que apenas um rosto está visível')
      return
    }

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
      // Get face data one more time for the final image
      const faces = await detectFaces(imageData)
      
      if (faces.length === 1) {
        stopCamera()
        onCapture(imageData, faces[0])
      } else {
        setError('Não foi possível detectar o rosto. Tente novamente.')
        setIsCapturing(false)
      }
    } else {
      setError('Erro ao capturar imagem. Tente novamente.')
      setIsCapturing(false)
    }
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
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover mirror"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Face detection box */}
        {faceBox && (
          <div
            className="absolute border-2 border-green-500 rounded"
            style={{
              left: `${faceBox.left}px`,
              top: `${faceBox.top}px`,
              width: `${faceBox.width}px`,
              height: `${faceBox.height}px`
            }}
          >
            <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
              Rosto detectado
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

        {/* Status overlay */}
        <div className="absolute top-4 left-4 right-4">
          <div className="bg-black bg-opacity-50 rounded-lg p-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <span className="text-sm">
                  {isStreaming ? 'Câmera ativa' : 'Câmera inativa'}
                </span>
              </div>
              <div className="text-sm">
                {isAnalyzing ? (
                  <span className="text-yellow-400">Analisando...</span>
                ) : facesDetected === 0 ? (
                  <span className="text-yellow-400">Nenhum rosto detectado</span>
                ) : facesDetected === 1 ? (
                  <span className="text-green-400">1 rosto detectado</span>
                ) : (
                  <span className="text-red-400">{facesDetected} rostos detectados</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Camera permission denied */}
        {cameraPermission === 'denied' && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center p-4">
            <div className="text-center text-white">
              <div className="text-4xl mb-4">📷</div>
              <h3 className="text-lg font-semibold mb-2">Câmera não autorizada</h3>
              <p className="text-sm text-gray-400">
                Por favor, autorize o acesso à câmera nas configurações do navegador
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">📝 Instruções:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Posicione seu rosto no centro da tela</li>
          <li>• Mantenha boa iluminação</li>
          <li>• Remova óculos escuros ou acessórios que cubram o rosto</li>
          <li>• Aguarde a detecção do rosto (quadro verde)</li>
          <li>• Clique em capturar quando estiver pronto</li>
        </ul>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={handleCapture}
          disabled={!isStreaming || facesDetected !== 1 || isCapturing || isAnalyzing}
          className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCapturing ? '⏳ Capturando...' : 
           isAnalyzing ? '🔍 Analisando...' :
           facesDetected !== 1 ? '⚠️ Posicione seu rosto' : 
           '📸 Capturar Foto'}
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
      </div>
    </div>
  )
}