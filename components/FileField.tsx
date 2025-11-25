'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface FileFieldProps {
  fieldName: string
  label: string
  placeholder?: string
  required: boolean
  accept?: string[]
  maxSizeMB?: number
  value?: any
  onChange: (data: any) => void
}

export default function FileField({
  fieldName,
  label,
  placeholder,
  required,
  accept = [],
  maxSizeMB = 5,
  value,
  onChange
}: FileFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [mode, setMode] = useState<'idle' | 'camera' | 'preview'>('idle')
  const [preview, setPreview] = useState<string | null>(value?.imageData || null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(value?.fileName || null)

  // Normalize accept formats
  const normalizedFormats = Array.isArray(accept)
    ? accept
    : (typeof accept === 'string' ? [accept] : [])

  // Initialize camera stream
  const initializeCameraStream = async () => {
    try {
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
      } else {
        throw new Error('Erro ao inicializar visualização da câmera')
      }
    } catch (err: any) {
      console.error('❌ Camera error:', err)
      const errorMessage = err.name === 'NotAllowedError'
        ? 'Permissão para acessar a câmera foi negada.'
        : err.name === 'NotFoundError'
        ? 'Nenhuma câmera foi encontrada neste dispositivo.'
        : err.message || 'Não foi possível acessar a câmera'

      setError(errorMessage)
      alert(errorMessage)
      setMode('idle')
    }
  }

  // Effect to initialize camera
  useEffect(() => {
    if (mode === 'camera' && !stream) {
      const timer = setTimeout(() => {
        initializeCameraStream()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [mode])

  // Start camera
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
        setFileName(`camera_${Date.now()}.jpg`)
        stopCamera()
        setMode('preview')

        // Save file data
        onChange({
          fieldName,
          imageData,
          fileName: `camera_${Date.now()}.jpg`,
          timestamp: new Date().toISOString(),
          source: 'camera'
        })
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

      // Check file format if specified
      if (normalizedFormats.length > 0) {
        const extension = file.name.split('.').pop()?.toLowerCase()
        if (extension && !normalizedFormats.some(f => f.includes(extension))) {
          setError(`Formato não aceito. Use: ${normalizedFormats.join(', ')}`)
          return
        }
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const imageData = e.target?.result as string
        setPreview(imageData)
        setFileName(file.name)
        setMode('preview')
        setError(null)

        // Save file data
        onChange({
          fieldName,
          imageData,
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date().toISOString(),
          source: 'upload'
        })
      }
      reader.readAsDataURL(file)
    }
  }

  // Remove file
  const removeFile = () => {
    setPreview(null)
    setFileName(null)
    setMode('idle')
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

  // Render camera mode
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

  // Render preview mode
  if (mode === 'preview' || preview) {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="relative bg-gray-100 rounded-lg overflow-hidden border-2 border-green-500">
          <img
            src={preview!}
            alt={label}
            className="w-full h-auto max-h-48 object-contain"
          />

          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
            ✓ Anexado
          </div>
        </div>

        {fileName && (
          <p className="text-sm text-gray-600 text-center">
            📎 {fileName}
          </p>
        )}

        <button
          type="button"
          onClick={removeFile}
          className="w-full py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
        >
          🗑️ Remover Arquivo
        </button>
      </div>
    )
  }

  // Render idle mode
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {placeholder && (
        <p className="text-xs text-gray-500">{placeholder}</p>
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
        accept={normalizedFormats.length > 0 ? normalizedFormats.join(',') : undefined}
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="text-xs text-gray-500 text-center">
        {normalizedFormats.length > 0 && `Formatos: ${normalizedFormats.join(', ').toUpperCase()} • `}
        Máx: {maxSizeMB}MB
      </div>
    </div>
  )
}
