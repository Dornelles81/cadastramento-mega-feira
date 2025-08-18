'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
// import Script from 'next/script' // Comentado temporariamente

interface MediaPipeFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

declare global {
  interface Window {
    FaceDetection: any
  }
}

export default function MediaPipeFaceCapture({ onCapture, onBack }: MediaPipeFaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceQuality, setFaceQuality] = useState<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const faceDetectorRef = useRef<any>(null)

  // Initialize MediaPipe
  const initializeMediaPipe = useCallback(async () => {
    if (typeof window !== 'undefined' && window.FaceDetection) {
      const faceDetection = new window.FaceDetection({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        }
      })

      faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5
      })

      faceDetection.onResults((results: any) => {
        if (results.detections && results.detections.length > 0) {
          const detection = results.detections[0]
          setFaceDetected(true)
          
          // Calculate quality score based on detection confidence
          const confidence = detection.score?.[0] || 0.5
          setFaceQuality(Math.round(confidence * 100))
          
          // Draw face box on canvas if needed
          if (canvasRef.current && videoRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
              const video = videoRef.current
              canvasRef.current.width = video.videoWidth
              canvasRef.current.height = video.videoHeight
              
              // Clear canvas
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
              
              // Draw face bounding box
              const bbox = detection.boundingBox
              ctx.strokeStyle = '#00FF00'
              ctx.lineWidth = 2
              ctx.strokeRect(
                bbox.xCenter - bbox.width / 2,
                bbox.yCenter - bbox.height / 2,
                bbox.width,
                bbox.height
              )
            }
          }
        } else {
          setFaceDetected(false)
          setFaceQuality(0)
        }
      })

      await faceDetection.initialize()
      faceDetectorRef.current = faceDetection
    }
  }, [])

  // Start camera stream
  const startCamera = async () => {
    try {
      setError(null)
      
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
        
        // Start face detection
        if (faceDetectorRef.current) {
          const detectFaces = async () => {
            if (videoRef.current && videoRef.current.readyState === 4) {
              await faceDetectorRef.current.send({ image: videoRef.current })
            }
            if (isStreaming) {
              requestAnimationFrame(detectFaces)
            }
          }
          detectFaces()
        }
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setError('Não foi possível acessar a câmera.')
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

  // Capture photo
  const handleCapture = async () => {
    if (!faceDetected) {
      setError('Por favor, posicione seu rosto na câmera')
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

    // Capture image
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        
        // Draw mirrored image
        ctx.save()
        ctx.scale(-1, 1)
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
        ctx.restore()
        
        const imageData = canvas.toDataURL('image/jpeg', 0.9)
        setCapturedImage(imageData)
        stopCamera()
        
        // Prepare face data
        const faceData = {
          confidence: faceQuality / 100,
          timestamp: new Date().toISOString(),
          detection: 'mediapipe'
        }
        
        // Send captured data
        setTimeout(() => {
          onCapture(imageData, faceData)
        }, 1000)
      }
    }
  }

  // Retry capture
  const retryCapture = () => {
    setCapturedImage(null)
    setIsCapturing(false)
    setError(null)
    startCamera()
  }

  // Initialize on mount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Load MediaPipe script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => initializeMediaPipe()
    document.head.appendChild(script)
    
    return () => {
      document.head.removeChild(script)
    }
  }, [initializeMediaPipe])

  return (
    <div className="space-y-4">
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[4/3]">
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => startCamera()}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              
              <canvas 
                ref={canvasRef} 
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
              />
              
              {/* Face detection indicator */}
              {isStreaming && (
                <div className="absolute top-4 right-4 bg-black bg-opacity-50 rounded-lg px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
                    <span className="text-white text-xs">
                      {faceDetected ? `Rosto detectado (${faceQuality}%)` : 'Procurando rosto...'}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Countdown */}
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
              <img 
                src={capturedImage} 
                alt="Captured" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <p className="text-lg font-semibold text-gray-800">Foto capturada!</p>
                  <p className="text-sm text-gray-600 mt-1">Qualidade: {faceQuality}%</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Instructions */}
        {!capturedImage && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">📝 Instruções:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Posicione seu rosto no centro</li>
              <li>• Mantenha boa iluminação</li>
              <li>• Aguarde o indicador verde</li>
              <li>• A detecção é automática</li>
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
                disabled={!isStreaming || !faceDetected || isCapturing}
                className={`w-full py-4 rounded-lg font-semibold transition-colors shadow-md ${
                  faceDetected && !isCapturing
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isCapturing ? '⏳ Capturando...' : 
                 !faceDetected ? '👤 Posicione seu rosto' : 
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
            </>
          ) : (
            <>
              <button
                onClick={retryCapture}
                className="w-full py-4 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors"
              >
                🔄 Tirar Nova Foto
              </button>
            </>
          )}
        </div>
      </div>
  )
}