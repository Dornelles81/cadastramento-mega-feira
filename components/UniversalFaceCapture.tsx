'use client'

import EnhancedFaceCapture from './EnhancedFaceCapture'

interface UniversalFaceCaptureProps {
  onCapture: (imageData: string, faceData?: any) => void
  onBack?: () => void
}

export default function UniversalFaceCapture({ onCapture, onBack }: UniversalFaceCaptureProps) {
  // Usar apenas o modo mobile que está funcionando
  return <EnhancedFaceCapture onCapture={onCapture} onBack={onBack} />
}