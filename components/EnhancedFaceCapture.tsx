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
  const [allowManualCapture, setAllowManualCapture] = useState(false)
  const [showUploadOption, setShowUploadOption] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Calculate quality score based on multiple factors - more lenient
  const calculateQualityScore = (brightness: number, width: number, height: number): number => {
    let score = 0.6 // Higher base score
    
    // Brightness score - more tolerant ranges
    if (brightness >= 50 && brightness <= 200) {
      score += 0.25
    } else if (brightness >= 30 && brightness <= 240) {
      score += 0.15
    } else {
      score += 0.05 // Still give some score even in poor lighting
    }
    
    // Resolution score
    if (width >= 1280 && height >= 960) {
      score += 0.15 // High resolution
    } else if (width >= 640 && height >= 480) {
      score += 0.1 // Medium resolution
    } else {
      score += 0.05 // Low resolution still gets some score
    }
    
    return Math.min(score, 1.0) // Cap at 1.0
  }

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
      
      // More tolerant skin tone detection
      // Accept wider range of colors
      if (r > 60 && g > 30 && b > 15 &&
          r > b &&
          Math.abs(r - g) > 5) {
        skinPixels++
      }
    }
    
    const skinPercentage = (skinPixels * 4) / centerData.length
    
    // More tolerant face detection
    // Accept wider range of lighting conditions and lower skin percentage
    const hasFace = avgBrightness > 30 && avgBrightness < 240 && skinPercentage > 0.05
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

  // Start camera stream with HTTP detection
  const startCamera = async () => {
    try {
      setError(null)

      // Check if running on HTTP (not localhost) - skip WebRTC camera
      const isHttp = window.location.protocol === 'http:' &&
                     window.location.hostname !== 'localhost' &&
                     window.location.hostname !== '127.0.0.1'

      if (isHttp) {
        // In HTTP contexts, WebRTC getUserMedia is blocked by browsers
        // Skip trying camera and go straight to file upload
        setError('📱 Use a câmera do seu celular!\n\n' +
                 '👇 Toque no botão abaixo para tirar sua foto.\n\n' +
                 '💡 O botão abrirá a câmera nativa do seu smartphone.')
        setShowUploadOption(true)
        setAllowManualCapture(true)
        return
      }

      // For HTTPS or localhost, try WebRTC camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 960, min: 480 },
          aspectRatio: { ideal: 4/3 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: false
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsStreaming(true)

        // Start face detection - check more frequently
        detectionIntervalRef.current = setInterval(detectFace, 200)

        // Enable manual capture after 3 seconds if face not detected
        setTimeout(() => {
          setAllowManualCapture(true)
        }, 3000)
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setError('❌ Erro ao acessar câmera.\n\nUse o upload de foto abaixo.')
      setShowUploadOption(true)
      setAllowManualCapture(true)
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

  // Handle file upload from mobile camera
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('❌ Por favor, selecione um arquivo de imagem.')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('❌ Imagem muito grande. Máximo 10MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const imageData = e.target?.result as string

      // Create image to check dimensions
      const img = new Image()
      img.onload = () => {
        // Create canvas to convert to proper format
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) return

        // Set reasonable size (max 800x800 to keep payload small)
        let width = img.width
        let height = img.height
        const maxSize = 800

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        // Use 0.6 compression to keep payload under limits
        const processedImage = canvas.toDataURL('image/jpeg', 0.6)

        // Send directly to parent without preview
        const faceData = {
          brightness: 128,
          timestamp: new Date().toISOString(),
          quality: 0.7,
          resolution: `${width}x${height}`,
          qualityPercentage: 70,
          uploadedFile: true
        }

        setCapturedImage(processedImage)

        // Send to parent component
        setTimeout(() => {
          onCapture(processedImage, faceData)
        }, 500)
      }

      img.src = imageData
    }

    reader.readAsDataURL(file)
  }

  // Capture photo
  const handleCapture = async () => {
    // Allow capture even without perfect face detection
    // Just warn if conditions are not ideal
    if (!faceDetected && brightness < 30) {
      setError('Iluminação muito baixa. Tente melhorar a luz.')
      // Don't return - allow capture anyway after warning
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
        // Resize to max 800px to prevent 413 errors
        let width = video.videoWidth
        let height = video.videoHeight
        const maxSize = 800

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        // Draw mirrored image
        ctx.save()
        ctx.scale(-1, 1)
        ctx.drawImage(video, -width, 0, width, height)
        ctx.restore()

        // Apply gentle brightness adjustments only if really needed
        if (brightness < 50) {
          ctx.filter = 'brightness(1.2) contrast(1.05)'
          ctx.drawImage(canvas, 0, 0)
        } else if (brightness > 220) {
          ctx.filter = 'brightness(0.95) contrast(1.05)'
          ctx.drawImage(canvas, 0, 0)
        }
        // For normal lighting (50-220), don't apply any filters

        // Use 0.7 quality - good balance between size and recognition accuracy
        const imageData = canvas.toDataURL('image/jpeg', 0.7)
        setCapturedImage(imageData)
        stopCamera()
        
        // Prepare face data with improved quality calculation
        const qualityScore = calculateQualityScore(brightness, canvas.width, canvas.height)
        const faceData = {
          brightness: brightness,
          timestamp: new Date().toISOString(),
          quality: qualityScore,
          resolution: `${canvas.width}x${canvas.height}`,
          qualityPercentage: Math.round(qualityScore * 100)
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
                    💡 Luz: {brightness < 30 ? 'Muito Baixa' : brightness < 60 ? 'Baixa' : brightness > 200 ? 'Alta' : 'Boa'} ({brightness})
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
            <li>• Centralize seu rosto no oval</li>
            <li>• Procure um local com boa iluminação</li>
            <li>• Evite contraluz (janela atrás)</li>
            <li>• Mantenha expressão neutra</li>
            <li>• Remova óculos escuros se possível</li>
          </ul>
          <p className="text-xs text-blue-600 mt-2 font-semibold">
            💡 Você pode capturar a foto mesmo se o oval estiver amarelo!
          </p>
        </div>
      )}

      {/* Error/Info message */}
      {error && (
        <div className={`px-4 py-3 rounded-lg ${
          error.includes('Use a câmera do seu celular')
            ? 'bg-blue-50 border border-blue-200 text-blue-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <pre className="whitespace-pre-wrap font-sans text-sm">{error}</pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {!capturedImage ? (
          <>
            {/* Primary capture button - works with or without detection */}
            {isStreaming && (
              <button
                onClick={handleCapture}
                disabled={isCapturing}
                className={`w-full py-4 rounded-lg font-semibold transition-colors shadow-md ${
                  faceDetected && !isCapturing
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : !isCapturing && allowManualCapture
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isCapturing ? '⏳ Capturando...' :
                 faceDetected ? '📸 Capturar Foto' :
                 allowManualCapture ? '📸 Capturar Mesmo Assim' :
                 '👤 Posicione seu rosto'}
              </button>
            )}

            {/* Upload option - shown when camera fails or as alternative */}
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
                    className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-md"
                  >
                    📸 Abrir Câmera e Tirar Foto
                  </button>
                </div>

                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-green-700">
                    ✅ Este botão abrirá a câmera nativa do seu celular para tirar a foto
                  </p>
                </div>
              </>
            )}

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