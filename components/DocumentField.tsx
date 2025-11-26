'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface DocumentFieldProps {
  documentType: string
  label: string
  description?: string
  required: boolean
  enableOCR: boolean
  acceptedFormats?: string[]
  maxSizeMB?: number
  value?: any
  onChange: (data: any) => void
  onOCRExtract?: (extractedData: any) => void
}

export default function DocumentField({
  documentType,
  label,
  description,
  required,
  enableOCR,
  acceptedFormats = ['jpg', 'jpeg', 'png'],
  maxSizeMB = 5,
  value,
  onChange,
  onOCRExtract
}: DocumentFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [mode, setMode] = useState<'idle' | 'camera' | 'preview'>('idle')
  const [preview, setPreview] = useState<string | null>(value?.imageData || null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [ocrResult, setOcrResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraRequested, setCameraRequested] = useState(false)

  // Normalize acceptedFormats to always be an array
  const normalizedFormats = Array.isArray(acceptedFormats)
    ? acceptedFormats
    : (typeof acceptedFormats === 'string'
      ? [acceptedFormats]
      : ['jpg', 'jpeg', 'png'])

  // Initialize camera stream when mode changes to 'camera'
  const initializeCameraStream = async () => {
    try {
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta acesso à câmera')
      }

      console.log('📷 Solicitando acesso à câmera...')
      setError(null)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      console.log('✅ Câmera acessada com sucesso')

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)
        console.log('✅ Stream conectado ao vídeo')
      } else {
        console.error('❌ videoRef.current is null')
        throw new Error('Erro ao inicializar visualização da câmera')
      }
    } catch (err: any) {
      console.error('❌ Camera error:', err)
      const errorMessage = err.name === 'NotAllowedError'
        ? 'Permissão para acessar a câmera foi negada. Por favor, permita o acesso à câmera nas configurações do navegador.'
        : err.name === 'NotFoundError'
        ? 'Nenhuma câmera foi encontrada neste dispositivo.'
        : err.message || 'Não foi possível acessar a câmera'

      setError(errorMessage)
      alert(errorMessage) // Show immediate feedback
      setMode('idle') // Return to idle on error
    }
  }

  // Effect to initialize camera when mode changes to 'camera'
  useEffect(() => {
    if (mode === 'camera' && !stream) {
      // Small delay to ensure videoRef is mounted
      const timer = setTimeout(() => {
        initializeCameraStream()
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [mode])

  // Start camera - just change mode
  const startCamera = () => {
    console.log('🎬 Iniciando modo câmera...')
    setMode('camera')
  }

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }, [stream])

  // Capture from camera
  const captureFromCamera = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        
        const imageData = canvas.toDataURL('image/jpeg', 0.9)
        setPreview(imageData)
        stopCamera()
        setMode('preview')
        
        // Save document data
        onChange({
          documentType,
          imageData,
          timestamp: new Date().toISOString()
        })

        // Process with OCR if enabled
        if (enableOCR) {
          processOCR(imageData)
        }
      }
    }
  }

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Check file size
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > maxSizeMB) {
        setError(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`)
        return
      }

      // Check file format
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (extension && !normalizedFormats.includes(extension)) {
        setError(`Formato não aceito. Use: ${normalizedFormats.join(', ')}`)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const imageData = e.target?.result as string
        setPreview(imageData)
        setMode('preview')
        setError(null)
        
        // Save document data
        onChange({
          documentType,
          imageData,
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date().toISOString()
        })

        // Process with OCR if enabled
        if (enableOCR) {
          processOCR(imageData)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  // Process with OCR
  const processOCR = async (imageData: string) => {
    if (!enableOCR) return

    setIsProcessing(true)
    setError(null)

    try {
      // Check if OCR server is available
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch('http://localhost:8000/ocr/extract-base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageData,
          document_type: documentType
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      const result = await response.json()

      if (result.success && result.data) {
        setOcrResult(result.data)

        // Notify parent component about extracted data
        if (onOCRExtract && result.data.is_valid) {
          onOCRExtract({
            name: result.data.name,
            cpf: result.data.cpf_number,
            rg: result.data.rg_number,
            cnh: result.data.cnh_number,
            birthDate: result.data.birth_date
          })
        }
      }
    } catch (err) {
      // OCR is optional - silently fail if server not available
      console.log('OCR service not available, continuing without OCR')
      // Don't show error to user
    } finally {
      setIsProcessing(false)
    }
  }

  // Remove document
  const removeDocument = () => {
    setPreview(null)
    setMode('idle')
    setOcrResult(null)
    setError(null)
    onChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Cancel camera
  const cancelCamera = () => {
    stopCamera()
    setMode('idle')
  }

  // Render based on mode
  if (mode === 'camera') {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          
          {/* Capture guide */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-4 border-2 border-white/30 rounded-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500"></div>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={captureFromCamera}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            📸 Capturar
          </button>
          
          <button
            type="button"
            onClick={cancelCamera}
            className="flex-1 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'preview' || preview) {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="relative bg-gray-100 rounded-lg overflow-hidden">
          <img 
            src={preview!} 
            alt={label}
            className="w-full h-auto max-h-48 object-contain"
          />
          
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            </div>
          )}

          {/* OCR Results */}
          {ocrResult && !isProcessing && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs">
              {ocrResult.is_valid ? (
                <span className="text-green-400">✅ Documento válido</span>
              ) : (
                <span className="text-yellow-400">⚠️ Verificação manual necessária</span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={removeDocument}
          className="w-full py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
        >
          🗑️ Remover Documento
        </button>
      </div>
    )
  }

  // Idle mode
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={startCamera}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          📷 Câmera
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          📁 Arquivo
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={normalizedFormats.map(f => `.${f}`).join(',')}
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="text-xs text-gray-500 text-center">
        Formatos: {normalizedFormats.join(', ').toUpperCase()} • Máx: {maxSizeMB}MB
      </div>
    </div>
  )
}