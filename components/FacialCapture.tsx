'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { FaceDetection } from '@mediapipe/face_detection'
import { Camera } from '@mediapipe/camera_utils'

interface FacialCaptureProps {
  onCapture: (imageData: string) => void
  onBack: () => void
  isSubmitting: boolean
}

type CaptureState = 'initializing' | 'ready' | 'detecting' | 'captured' | 'error'

export default function FacialCapture({ onCapture, onBack, isSubmitting }: FacialCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<Camera | null>(null)
  const faceDetectionRef = useRef<FaceDetection | null>(null)
  
  const [state, setState] = useState<CaptureState>('initializing')
  const [faceDetected, setFaceDetected] = useState(false)
  const [qualityScore, setQualityScore] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  // Initialize MediaPipe Face Detection
  const initializeFaceDetection = useCallback(async () => {
    try {
      const faceDetection = new FaceDetection({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
      })

      await faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5
      })

      faceDetection.onResults((results) => {
        if (results.detections && results.detections.length > 0) {
          const detection = results.detections[0]
          const score = detection.score[0] || 0
          
          setFaceDetected(score > 0.7)
          setQualityScore(score)
          
          if (score > 0.8) {
            setState('ready')
          }
        } else {
          setFaceDetected(false)
          setQualityScore(0)
        }
      })

      faceDetectionRef.current = faceDetection
      return faceDetection
    } catch (error) {
      console.error('Face detection initialization failed:', error)
      setErrorMessage('Falha ao inicializar detecção facial')
      setState('error')
      return null
    }
  }, [])

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    if (!videoRef.current || !faceDetectionRef.current) return

    try {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceDetectionRef.current && videoRef.current) {
            await faceDetectionRef.current.send({ image: videoRef.current })
          }
        },
        width: 640,
        height: 480
      })

      await camera.start()
      cameraRef.current = camera
      setState('detecting')
    } catch (error) {
      console.error('Camera initialization failed:', error)
      setErrorMessage('Não foi possível acessar a câmera. Verifique as permissões.')
      setState('error')
    }
  }, [])

  // Initialize everything
  useEffect(() => {
    const init = async () => {
      setState('initializing')
      const detection = await initializeFaceDetection()
      if (detection) {
        await initializeCamera()
      }
    }
    
    init()

    // Cleanup
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop()
      }
      if (faceDetectionRef.current) {
        faceDetectionRef.current.close()
      }
    }
  }, [initializeFaceDetection, initializeCamera])

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceDetected) return

    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')

    if (ctx) {
      canvas.width = 640
      canvas.height = 480

      // Flip horizontally to match mirror effect
      ctx.scale(-1, 1)
      ctx.drawImage(video, -640, 0, 640, 480)

      // Convert to high-quality JPEG
      const imageData = canvas.toDataURL('image/jpeg', 0.9)
      setState('captured')
      
      // Vibrate on capture (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(100)
      }

      onCapture(imageData)
    }
  }, [faceDetected, onCapture])

  const getStateMessage = () => {
    switch (state) {
      case 'initializing':
        return 'Inicializando câmera...'
      case 'detecting':
        return 'Posicione seu rosto na tela'
      case 'ready':
        return faceDetected ? 'Perfeito! Toque para capturar' : 'Centralize seu rosto'
      case 'captured':
        return 'Foto capturada com sucesso!'
      case 'error':
        return errorMessage
      default:
        return ''
    }
  }

  const getInstructions = () => {
    if (state === 'error') return []
    
    return [
      '📱 Segure o celular na vertical',
      '💡 Certifique-se de ter boa iluminação',
      '👤 Mantenha o rosto centralizado',
      '📷 Remova óculos escuros se possível'
    ]
  }

  return (
    <div className="space-y-6">
      {/* Camera viewfinder */}
      <div className="relative">
        <div className="camera-viewfinder">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          
          {/* Face detection overlay */}
          <div className="camera-overlay">
            <div className={`face-detection-circle ${faceDetected ? 'face-detected' : ''}`} />
            
            {/* Quality indicator */}
            {qualityScore > 0 && (
              <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                Qualidade: {Math.round(qualityScore * 100)}%
              </div>
            )}
          </div>

          {/* Loading overlay */}
          {state === 'initializing' && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center animate-fade-in">
              <div className="text-center text-white">
                <div className="spinner mb-4" />
                <p>Inicializando...</p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Status message */}
      <div className="text-center">
        <p
          key={state}
          className={`text-lg font-semibold animate-fade-in ${
            state === 'error' ? 'text-red-600' :
            state === 'ready' && faceDetected ? 'text-green-600' :
            'text-gray-600'
          }`}
        >
          {getStateMessage()}
        </p>
      </div>

      {/* Instructions */}
      {state !== 'error' && state !== 'captured' && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-2">Instruções:</h3>
          <ul className="space-y-1">
            {getInstructions().map((instruction, index) => (
              <li key={index} className="text-sm text-gray-600">
                {instruction}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {state === 'ready' && faceDetected && !isSubmitting && (
          <button
            onClick={capturePhoto}
            className="btn-primary w-full animate-fade-in"
          >
            📸 Capturar Foto
          </button>
        )}

        {state === 'error' && (
          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            🔄 Tentar Novamente
          </button>
        )}

        {isSubmitting && (
          <div className="flex items-center justify-center py-4">
            <div className="spinner mr-3" />
            <span className="text-gray-600">Enviando dados...</span>
          </div>
        )}

        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="btn-secondary w-full"
        >
          ← Voltar
        </button>
      </div>
    </div>
  )
}