'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface EnhancedFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

export default function EnhancedFaceCapture({ onCapture, onBack }: EnhancedFaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [faceDetected, setFaceDetected] = useState(false)
  const [brightness, setBrightness] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionIntervalRef = useRef<NodeJS.Timeout>()

  // Simple face detection using canvas analysis
  const detectFace = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    
    if (!ctx || video.videoWidth === 0) return

    // Set canvas size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Get image data for analysis
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    
    // Calculate average brightness
    let totalBrightness = 0
    let pixelCount = 0
    
    // Sample every 10th pixel for performance
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const brightness = (r + g + b) / 3
      totalBrightness += brightness
      pixelCount++
    }
    
    const avgBrightness = totalBrightness / pixelCount
    setBrightness(Math.round(avgBrightness))
    
    // Simple face detection based on center region analysis
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const regionSize = Math.min(canvas.width, canvas.height) * 0.3
    
    // Check center region for face-like characteristics
    const centerImageData = ctx.getImageData(
      centerX - regionSize/2, 
      centerY - regionSize/2, 
      regionSize, 
      regionSize
    )
    
    // Analyze skin tone presence (very basic)
    let skinPixels = 0
    const centerData = centerImageData.data
    
    for (let i = 0; i < centerData.length; i += 4) {
      const r = centerData[i]
      const g = centerData[i + 1]
      const b = centerData[i + 2]
      
      // Basic skin tone detection
      if (r > 95 && g > 40 && b > 20 &&
          r > g && r > b &&
          Math.abs(r - g) > 15 &&
          r - g > 15) {
        skinPixels++
      }
    }
    
    const skinPercentage = (skinPixels * 4) / centerData.length
    
    // Consider face detected if good lighting and skin tone present
    const hasFace = avgBrightness > 50 && avgBrightness < 200 && skinPercentage > 0.2
    setFaceDetected(hasFace)
    
    // Draw guide overlay
    ctx.strokeStyle = hasFace ? '#00FF00' : '#FFFF00'
    ctx.lineWidth = 3
    ctx.setLineDash([10, 5])
    
    // Draw oval guide for face placement
    ctx.beginPath()
    ctx.ellipse(centerX, centerY * 0.9, regionSize * 0.8, regionSize * 1.1, 0, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.setLineDash([])
  }, [])

  // Start camera stream
  const startCamera = async () => {
    try {
      setError(null)
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          aspectRatio: { ideal: 4/3 }
        },
        audio: false
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsStreaming(true)
        
        // Start face detection
        detectionIntervalRef.current = setInterval(detectFace, 500)
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Acesso à câmera negado. Por favor, permita o acesso à câmera.')
      } else {
        setError('Não foi possível acessar a câmera.')
      }
    }
  }

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
    }
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
      setError('Por favor, posicione seu rosto no centro da tela')
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
        
        // Apply slight brightness adjustment if needed
        if (brightness < 80) {
          ctx.filter = 'brightness(1.2)'
          ctx.drawImage(canvas, 0, 0)
        }
        
        const imageData = canvas.toDataURL('image/jpeg', 0.95)
        setCapturedImage(imageData)
        stopCamera()
        
        // Prepare face data
        const faceData = {
          brightness: brightness,
          timestamp: new Date().toISOString(),
          quality: brightness > 60 && brightness < 180 ? 'good' : 'acceptable'
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
    startCamera()
    return () => {
      stopCamera()
    }
  }, [stopCamera])

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
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full pointer-events-none mix-blend-multiply opacity-50"
              style={{ transform: 'scaleX(-1)' }}
            />
            
            {/* Status indicators */}
            {isStreaming && (
              <div className="absolute top-4 left-4 right-4 flex justify-between">
                <div className="bg-black bg-opacity-50 rounded-lg px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
                    <span className="text-white text-xs">
                      {faceDetected ? 'Rosto detectado' : 'Posicione seu rosto'}
                    </span>
                  </div>
                </div>
                
                <div className="bg-black bg-opacity-50 rounded-lg px-3 py-2">
                  <span className="text-white text-xs">
                    💡 Luz: {brightness < 50 ? 'Baixa' : brightness > 180 ? 'Alta' : 'Boa'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Center guide text */}
            {isStreaming && !faceDetected && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
                  Centralize seu rosto no oval
                </span>
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
                <p className="text-sm text-gray-600 mt-1">
                  Qualidade: {brightness > 60 && brightness < 180 ? 'Ótima' : 'Boa'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Instructions */}
      {!capturedImage && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">📝 Dicas para melhor foto:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Centralize seu rosto no oval verde</li>
            <li>• Procure um local bem iluminado</li>
            <li>• Evite contraluz (janela atrás)</li>
            <li>• Mantenha expressão neutra</li>
            <li>• Remova óculos escuros</li>
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
            <p className="text-center text-sm text-gray-600">
              Processando... Aguarde
            </p>
          </>
        )}
      </div>
    </div>
  )
}