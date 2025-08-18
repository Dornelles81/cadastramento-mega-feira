'use client'

import { useRef, useState, useCallback } from 'react'
import Image from 'next/image'

interface DocumentCaptureProps {
  onCapture: (documentData: any) => void
  onSkip?: () => void
  documentType?: 'auto' | 'cpf' | 'rg' | 'cnh'
}

interface DocumentData {
  document_type?: string
  document_number?: string
  name?: string
  birth_date?: string
  rg_number?: string
  cpf_number?: string
  cnh_number?: string
  raw_text: string[]
  confidence: number
  is_valid: boolean
  validation_errors: string[]
}

export default function DocumentCapture({ 
  onCapture, 
  onSkip,
  documentType = 'auto' 
}: DocumentCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'choose' | 'camera' | 'file'>('choose')
  const [isProcessing, setIsProcessing] = useState(false)
  const [documentImage, setDocumentImage] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<DocumentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Process document with OCR
  const processDocument = async (imageBase64: string) => {
    setIsProcessing(true)
    setError(null)
    
    try {
      // Call OCR service
      const response = await fetch('http://localhost:8000/ocr/extract-base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBase64,
          document_type: documentType
        })
      })

      const result = await response.json()
      
      if (result.success && result.data) {
        setExtractedData(result.data)
        
        // Auto-fill form if data is valid
        if (result.data.is_valid) {
          onCapture({
            ...result.data,
            documentImage: imageBase64
          })
        }
      } else {
        setError(result.error || 'Não foi possível processar o documento')
      }
    } catch (err) {
      console.error('OCR Error:', err)
      setError('Serviço de OCR não disponível. Verifique se o servidor está rodando.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)
        setMode('camera')
      }
    } catch (err) {
      console.error('Camera error:', err)
      setError('Não foi possível acessar a câmera')
    }
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
        
        const imageData = canvas.toDataURL('image/jpeg', 0.95)
        setDocumentImage(imageData)
        stopCamera()
        processDocument(imageData)
      }
    }
  }

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const imageData = e.target?.result as string
        setDocumentImage(imageData)
        setMode('file')
        processDocument(imageData)
      }
      reader.readAsDataURL(file)
    }
  }

  // Retry capture
  const retry = () => {
    setDocumentImage(null)
    setExtractedData(null)
    setError(null)
    setMode('choose')
  }

  // Manual confirm (even with errors)
  const confirmData = () => {
    if (extractedData) {
      onCapture({
        ...extractedData,
        documentImage: documentImage
      })
    }
  }

  if (mode === 'choose') {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">📄 Validação de Documento</h3>
          <p className="text-sm text-blue-700">
            Capture ou envie uma foto do seu documento (RG, CPF ou CNH) para validação automática.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={startCamera}
            className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            📷 Usar Câmera
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            📁 Enviar Arquivo
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full py-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Pular Validação →
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    )
  }

  if (mode === 'camera') {
    return (
      <div className="space-y-4">
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
            <div className="absolute inset-4 border-2 border-white/50 rounded-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500"></div>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="bg-yellow-50 p-3 rounded-lg">
          <p className="text-sm text-yellow-800">
            💡 Posicione o documento dentro da área marcada
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={captureFromCamera}
            className="flex-1 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            📸 Capturar
          </button>
          
          <button
            onClick={() => {
              stopCamera()
              setMode('choose')
            }}
            className="flex-1 py-4 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Document preview */}
      {documentImage && (
        <div className="relative bg-gray-100 rounded-lg overflow-hidden">
          <img 
            src={documentImage} 
            alt="Documento" 
            className="w-full h-auto max-h-64 object-contain"
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm mt-2">Processando...</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extracted data */}
      {extractedData && !isProcessing && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            {extractedData.is_valid ? (
              <span className="text-green-600">✅ Documento Válido</span>
            ) : (
              <span className="text-yellow-600">⚠️ Verificação Manual Necessária</span>
            )}
          </h3>

          <div className="space-y-2 text-sm">
            {extractedData.document_type && (
              <div>
                <span className="text-gray-600">Tipo:</span>{' '}
                <span className="font-medium">
                  {extractedData.document_type.toUpperCase()}
                </span>
              </div>
            )}
            
            {extractedData.name && (
              <div>
                <span className="text-gray-600">Nome:</span>{' '}
                <span className="font-medium">{extractedData.name}</span>
              </div>
            )}
            
            {extractedData.cpf_number && (
              <div>
                <span className="text-gray-600">CPF:</span>{' '}
                <span className="font-medium">{extractedData.cpf_number}</span>
              </div>
            )}
            
            {extractedData.rg_number && (
              <div>
                <span className="text-gray-600">RG:</span>{' '}
                <span className="font-medium">{extractedData.rg_number}</span>
              </div>
            )}
            
            {extractedData.cnh_number && (
              <div>
                <span className="text-gray-600">CNH:</span>{' '}
                <span className="font-medium">{extractedData.cnh_number}</span>
              </div>
            )}

            {extractedData.confidence > 0 && (
              <div>
                <span className="text-gray-600">Confiança:</span>{' '}
                <span className="font-medium">
                  {(extractedData.confidence * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {extractedData.validation_errors.length > 0 && (
            <div className="bg-red-50 p-3 rounded text-sm text-red-700">
              {extractedData.validation_errors.map((error, idx) => (
                <div key={idx}>• {error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Actions */}
      {extractedData && !isProcessing && (
        <div className="space-y-3">
          {extractedData.is_valid ? (
            <button
              onClick={confirmData}
              className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              ✅ Confirmar e Continuar
            </button>
          ) : (
            <>
              <button
                onClick={confirmData}
                className="w-full py-4 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors"
              >
                ⚠️ Usar Dados Mesmo Assim
              </button>
              <button
                onClick={retry}
                className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                🔄 Tentar Novamente
              </button>
            </>
          )}
          
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full py-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Preencher Manualmente →
            </button>
          )}
        </div>
      )}
    </div>
  )
}