'use client'

import { useState, useEffect } from 'react'

interface SuccessScreenProps {
  participantName: string
  onNewRegistration: () => void
}

export default function SuccessScreen({ participantName, onNewRegistration }: SuccessScreenProps) {
  const [showConfetti, setShowConfetti] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const shareText = `Acabei de me cadastrar na Mega Feira 2025! 🎉 Acesso por reconhecimento facial habilitado. #MegaFeira2025`

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cadastro Mega Feira 2025',
          text: shareText,
          url: window.location.origin
        })
      } catch (error) {
        console.log('Share cancelled')
      }
    } else {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText)
        alert('Texto copiado para a área de transferência!')
      }
    }
  }

  return (
    <div className="text-center space-y-6 animate-fade-in">
      {/* Success icon */}
      <div className="relative">
        <div className="text-6xl mb-4 animate-pulse-slow">
          ✅
        </div>
        
        {/* Confetti effect */}
        {showConfetti && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <div className="text-2xl animate-bounce">🎉</div>
          </div>
        )}
      </div>

      {/* Success message */}
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-green-600 mb-2">
          Cadastro Realizado!
        </h2>
        <p className="text-gray-700 mb-1">
          Parabéns, <strong>{participantName}</strong>!
        </p>
        <p className="text-mobile-sm text-gray-600">
          Seu cadastro facial foi concluído com sucesso
        </p>
      </div>

      {/* Info cards */}
      <div className="space-y-3">
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-center mb-2">
            <span className="text-2xl mr-2">🎪</span>
            <span className="font-semibold text-green-800">Acesso Liberado</span>
          </div>
          <p className="text-sm text-green-700">
            Você já pode entrar na Mega Feira usando reconhecimento facial
          </p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-center mb-2">
            <span className="text-2xl mr-2">📱</span>
            <span className="font-semibold text-blue-800">Como Entrar</span>
          </div>
          <p className="text-sm text-blue-700">
            No evento, posicione seu rosto na frente do terminal de acesso
          </p>
        </div>

        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div className="flex items-center justify-center mb-2">
            <span className="text-2xl mr-2">🔒</span>
            <span className="font-semibold text-yellow-800">Seus Dados</span>
          </div>
          <p className="text-sm text-yellow-700">
            Exclusão automática em 90 dias • Protegido pela LGPD
          </p>
        </div>
      </div>

      {/* Next steps */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-3">📋 Próximos Passos</h3>
        <ul className="text-left space-y-2 text-sm text-gray-700">
          <li className="flex items-center">
            <span className="text-blue-500 mr-2">1.</span>
            Guarde este comprovante (screenshot se quiser)
          </li>
          <li className="flex items-center">
            <span className="text-blue-500 mr-2">2.</span>
            Chegue ao evento com antecedência
          </li>
          <li className="flex items-center">
            <span className="text-blue-500 mr-2">3.</span>
            Use o terminal de acesso facial na entrada
          </li>
          <li className="flex items-center">
            <span className="text-blue-500 mr-2">4.</span>
            Tenha um documento com foto como backup
          </li>
        </ul>
      </div>

      {/* Action buttons */}
      <div className="space-y-3 pt-4">
        <button
          onClick={handleShare}
          className="btn-primary w-full"
        >
          📤 Compartilhar Sucesso
        </button>

        <button
          onClick={onNewRegistration}
          className="btn-secondary w-full"
        >
          ➕ Novo Cadastro
        </button>
      </div>

      {/* Contact info */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          🎫 <strong>Mega Feira 2025</strong><br/>
          📧 Suporte: suporte@megafeira.com<br/>
          📞 WhatsApp: (11) 99999-9999
        </p>
      </div>
    </div>
  )
}