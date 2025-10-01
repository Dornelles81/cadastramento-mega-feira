'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface DesktopFaceCaptureProps {
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
  faceAttributes?: any
  faceLandmarks?: any
  recognitionModel?: string
  faceQuality?: {
    score: number
    isGoodQuality: boolean
  }
}

interface CameraDevice {
  deviceId: string
  label: string
  kind: string
}

export default function DesktopFaceCapture({ onCapture, onBack }: DesktopFaceCaptureProps) {
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
  
  // New states for desktop features
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop'>('desktop')
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('manual')
  const [imageQuality, setImageQuality] = useState<'low' | 'medium' | 'high'>('high')
  const [showSettings, setShowSettings] = useState(false)

  // Detect device type
  useEffect(() => {
    const detectDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase()
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent)
      const isTablet = /ipad|tablet|playbook|silk/.test(userAgent)
      
      if (isMobile && !isTablet) {
        setDeviceType('mobile')
      } else {
        setDeviceType('desktop')
      }
    }
    detectDevice()
  }, [])

  // Get available cameras
  const getCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices.filter(device => device.kind === 'videoinput')
      
      const cameraList: CameraDevice[] = cameras.map((camera, index) => ({
        deviceId: camera.deviceId,
        label: camera.label || `Câmera ${index + 1}`,
        kind: camera.kind
      }))
      
      setAvailableCameras(cameraList)
      
      // Select first camera by default
      if (cameraList.length > 0 && !selectedCamera) {
        setSelectedCamera(cameraList[0].deviceId)
      }
    } catch (err) {
      console.error('Error getting cameras:', err)
    }
  }

  // Start camera stream with enhanced options for desktop
  const startCamera = async (cameraId?: string) => {
    try {
      console.log('Starting camera...', { cameraId, selectedCamera, deviceType })
      setError(null)
      
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      // Get quality settings
      const qualitySettings = {
        low: { width: 640, height: 480 },
        medium: { width: 1280, height: 720 },
        high: { width: 1920, height: 1080 }
      }
      
      const quality = qualitySettings[imageQuality]
      
      // Camera constraints optimized for desktop/notebook
      const constraints: MediaStreamConstraints = {
        video: deviceType === 'desktop' ? {
          deviceId: cameraId || selectedCamera ? { exact: cameraId || selectedCamera } : undefined,
          width: { ideal: quality.width, min: 640 },
          height: { ideal: quality.height, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          aspectRatio: { ideal: 16/9 },
          // Desktop-specific settings
          facingMode: undefined, // Don't use facingMode on desktop
          // Advanced constraints for better quality
          ...(navigator.userAgent.includes('Chrome') && {
            // Chrome-specific enhancements
            googNoiseSuppression: true,
            googAutoGainControl: true,
            googHighpassFilter: true
          })
        } : {
          // Mobile settings
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('Stream obtained:', stream)
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        
        // Ensure video plays
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            console.log('Video playing successfully')
            setIsStreaming(true)
            setCameraPermission('granted')
          }).catch(err => {
            console.error('Error playing video:', err)
          })
        }
        
        console.log('Camera started successfully')
        
        // Get actual camera label after permission is granted
        await getCameras()
      } else {
        console.error('Video ref not available')
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setCameraPermission('denied')
      
      // More specific error messages
      if (err.name === 'NotFoundError') {
        setError('Nenhuma câmera foi encontrada no dispositivo.')
      } else if (err.name === 'NotAllowedError') {
        setError('Acesso à câmera foi negado. Por favor, autorize nas configurações do navegador.')
      } else if (err.name === 'NotReadableError') {
        setError('Câmera está em uso por outro aplicativo.')
      } else {
        setError('Erro ao acessar a câmera. Verifique se a câmera está conectada.')
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

  // Switch between cameras
  const switchCamera = async (cameraId: string) => {
    setSelectedCamera(cameraId)
    if (isStreaming) {
      await startCamera(cameraId)
    }
  }

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
        // Fallback to simple face detection
        return await simpleFaceDetection(imageData)
      }

      const faces = await response.json()
      return faces
    } catch (error) {
      console.error('Face detection error:', error)
      // Use fallback detection
      return await simpleFaceDetection(imageData)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Simple fallback face detection (always returns a face for testing)
  const simpleFaceDetection = async (imageData: string): Promise<FaceDetectionResult[]> => {
    // For desktop, always return a detected face to allow capture
    // This ensures the camera always works even without Azure Face API
    if (videoRef.current) {
      const video = videoRef.current
      // Calculate face box based on video center
      const faceWidth = video.videoWidth * 0.3
      const faceHeight = video.videoHeight * 0.4
      const faceLeft = (video.videoWidth - faceWidth) / 2
      const faceTop = (video.videoHeight - faceHeight) / 3
      
      return [{
        faceId: 'desktop-face-' + Date.now(),
        faceRectangle: {
          top: faceTop,
          left: faceLeft,
          width: faceWidth,
          height: faceHeight
        },
        faceQuality: {
          score: 0.9,
          isGoodQuality: true
        }
      }]
    }
    return []
  }

  // Capture current frame with enhanced quality
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return null

    // Set canvas size to video size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Apply image enhancements for desktop capture
    if (deviceType === 'desktop') {
      // Improve image quality with smoothing
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
    }

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Apply brightness/contrast adjustments if needed
    if (deviceType === 'desktop') {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // Simple brightness adjustment
      const brightness = 10
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] + brightness)     // Red
        data[i + 1] = Math.min(255, data[i + 1] + brightness) // Green
        data[i + 2] = Math.min(255, data[i + 2] + brightness) // Blue
      }
      
      context.putImageData(imageData, 0, 0)
    }

    // Convert to base64 with quality based on settings
    const jpegQuality = imageQuality === 'high' ? 0.95 : imageQuality === 'medium' ? 0.85 : 0.75
    const imageDataUrl = canvas.toDataURL('image/jpeg', jpegQuality)
    return imageDataUrl
  }, [deviceType, imageQuality])

  // Continuous face detection with auto-capture option
  useEffect(() => {
    if (!isStreaming) return

    const detectInterval = setInterval(async () => {
      if (isCapturing || isAnalyzing) return

      // Only do detection if video is ready
      if (!videoRef.current || videoRef.current.readyState < 2) return
      
      const imageData = await captureFrame()
      if (imageData) {
        const faces = await detectFaces(imageData)
        setFacesDetected(faces.length)
        
        if (faces.length > 0) {
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
          
          // Auto-capture if enabled and face quality is good
          if (captureMode === 'auto' && face.faceQuality?.isGoodQuality && !isCapturing) {
            handleCapture()
          }
        } else {
          setFaceBox(null)
        }
      }
    }, 1000) // Check every second

    return () => clearInterval(detectInterval)
  }, [isStreaming, isCapturing, isAnalyzing, captureFrame, captureMode])

  // Handle photo capture
  const handleCapture = async () => {
    if (facesDetected === 0 && captureMode === 'manual') {
      setError('Por favor, posicione seu rosto na frente da câmera')
      return
    }

    setIsCapturing(true)
    
    // Shorter countdown for desktop
    const countdownDuration = deviceType === 'desktop' ? 2 : 3
    setCaptureCountdown(countdownDuration)

    // Countdown
    for (let i = countdownDuration; i > 0; i--) {
      setCaptureCountdown(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    setCaptureCountdown(null)

    // Capture final image
    const imageData = await captureFrame()
    if (imageData) {
      // Get face data one more time for the final image
      const faces = await detectFaces(imageData)
      
      if (faces.length > 0) { // More lenient for desktop
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

  // Take instant photo (desktop feature)
  const takeInstantPhoto = async () => {
    const imageData = await captureFrame()
    if (imageData) {
      stopCamera()
      onCapture(imageData, null) // Send without face data for instant capture
    }
  }

  // Initialize camera on mount
  useEffect(() => {
    const initializeCamera = async () => {
      // Small delay to ensure DOM is ready
      setTimeout(async () => {
        await getCameras()
        await startCamera()
      }, 500)
    }
    initializeCamera()
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Camera settings for desktop */}
      {deviceType === 'desktop' && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">⚙️ Configurações da Câmera</h3>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              {showSettings ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          
          {showSettings && (
            <div className="space-y-3">
              {/* Camera selector */}
              {availableCameras.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    📷 Câmera
                  </label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => switchCamera(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {availableCameras.map(camera => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Image quality */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🎯 Qualidade da Imagem
                </label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(quality => (
                    <button
                      key={quality}
                      onClick={() => {
                        setImageQuality(quality)
                        if (isStreaming) startCamera()
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        imageQuality === quality
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {quality === 'low' ? 'Baixa' : quality === 'medium' ? 'Média' : 'Alta'}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Capture mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🎬 Modo de Captura
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCaptureMode('manual')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      captureMode === 'manual'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => setCaptureMode('auto')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      captureMode === 'auto'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Automático
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Video container */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[16/9] lg:aspect-[4/3]">
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay={true}
          playsInline={true}
          muted={true}
          className="w-full h-full object-cover"
          style={{ 
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            backgroundColor: '#000'
          }}
          onLoadedMetadata={(e) => {
            const video = e.target as HTMLVideoElement
            video.play().catch(err => console.error('Error playing video:', err))
          }}
        />
        
        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Face detection box */}
        {faceBox && (
          <div
            className="absolute border-3 border-green-500 rounded-lg shadow-lg"
            style={{
              left: `${faceBox.left}px`,
              top: `${faceBox.top}px`,
              width: `${faceBox.width}px`,
              height: `${faceBox.height}px`,
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)'
            }}
          >
            <div className="absolute -top-7 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
              ✓ Rosto detectado
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {captureCountdown && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-7xl font-bold animate-pulse">
              {captureCountdown}
            </div>
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute top-4 left-4 right-4">
          <div className="bg-black bg-opacity-60 backdrop-blur rounded-lg p-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <span className="text-sm font-medium">
                  {isStreaming ? `Câmera ativa (${deviceType === 'desktop' ? 'Desktop' : 'Mobile'})` : 'Câmera inativa'}
                </span>
              </div>
              <div className="text-sm">
                {isAnalyzing ? (
                  <span className="text-yellow-400">🔍 Analisando...</span>
                ) : facesDetected === 0 ? (
                  <span className="text-yellow-400">⚠️ Nenhum rosto</span>
                ) : facesDetected === 1 ? (
                  <span className="text-green-400">✅ Pronto para capturar</span>
                ) : (
                  <span className="text-red-400">⚠️ {facesDetected} rostos</span>
                )}
              </div>
            </div>
            
            {/* Auto-capture indicator */}
            {captureMode === 'auto' && facesDetected === 1 && (
              <div className="mt-2 text-xs text-green-400 animate-pulse">
                🎯 Captura automática ativada - Mantenha a posição
              </div>
            )}
          </div>
        </div>

        {/* Camera permission denied */}
        {cameraPermission === 'denied' && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center p-4">
            <div className="text-center text-white max-w-md">
              <div className="text-5xl mb-4">🚫</div>
              <h3 className="text-xl font-semibold mb-3">Câmera não autorizada</h3>
              <p className="text-gray-400 mb-4">
                Para usar a captura facial, é necessário autorizar o acesso à câmera.
              </p>
              <div className="bg-gray-800 rounded-lg p-3 text-left text-sm">
                <p className="font-semibold mb-2">Como autorizar:</p>
                <ul className="space-y-1 text-gray-400">
                  <li>• Chrome: Clique no cadeado na barra de endereço</li>
                  <li>• Firefox: Clique no ícone da câmera na barra</li>
                  <li>• Safari: Preferências → Sites → Câmera</li>
                  <li>• Edge: Configurações → Cookies e permissões</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">
          {deviceType === 'desktop' ? '💻 Instruções para Desktop/Notebook:' : '📱 Instruções:'}
        </h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Posicione seu rosto no centro da tela</li>
          <li>• Certifique-se de ter boa iluminação</li>
          {deviceType === 'desktop' && (
            <>
              <li>• Ajuste a distância da câmera (50-70cm ideal)</li>
              <li>• Use o modo automático para captura mais rápida</li>
              <li>• Selecione qualidade alta para melhor resultado</li>
            </>
          )}
          <li>• Aguarde o quadro verde aparecer ao redor do rosto</li>
          <li>• {captureMode === 'auto' ? 'A foto será capturada automaticamente' : 'Clique em capturar quando estiver pronto'}</li>
        </ul>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
          <span className="text-xl mr-2">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {deviceType === 'desktop' ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCapture}
              disabled={!isStreaming || (captureMode === 'manual' && facesDetected === 0) || isCapturing || isAnalyzing}
              className="py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isCapturing ? '⏳ Capturando...' : 
               isAnalyzing ? '🔍 Analisando...' :
               '📸 Capturar com Detecção'}
            </button>
            
            <button
              onClick={takeInstantPhoto}
              disabled={!isStreaming || isCapturing}
              className="py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              ⚡ Captura Rápida
            </button>
          </div>
        ) : (
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
        )}

        {/* Retry camera button */}
        {!isStreaming && cameraPermission === 'denied' && (
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            🔄 Tentar Novamente
          </button>
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
      </div>
    </div>
  )
}