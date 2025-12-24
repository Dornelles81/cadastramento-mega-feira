'use client'

import { useState } from 'react'

interface ConsentFormProps {
  onAccept: () => void
}

export default function ConsentForm({ onAccept }: ConsentFormProps) {
  const [hasReadTerms, setHasReadTerms] = useState(false)
  const [acceptsTerms, setAcceptsTerms] = useState(false)
  const [showFullTerms, setShowFullTerms] = useState(false)

  const handleAccept = () => {
    if (acceptsTerms && hasReadTerms) {
      onAccept()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Consentimento para Dados Biométricos
        </h2>
        <p className="text-mobile-sm text-gray-600">
          Para acessar o evento, precisamos da sua autorização
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-primary-500">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center">
          📋 Resumo do Consentimento
        </h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start">
            <span className="text-success-500 mr-2">✓</span>
            Coletaremos sua <strong>foto facial</strong> e <strong>dados pessoais</strong>
          </li>
          <li className="flex items-start">
            <span className="text-success-500 mr-2">✓</span>
            Uso exclusivo para <strong>controle de acesso</strong> ao evento
          </li>
          <li className="flex items-start">
            <span className="text-success-500 mr-2">✓</span>
            Dados <strong>criptografados</strong> e seguros (LGPD)
          </li>
          <li className="flex items-start">
            <span className="text-success-500 mr-2">✓</span>
            <strong>Exclusão automática</strong> em 90 dias após o evento
          </li>
          <li className="flex items-start">
            <span className="text-warning-500 mr-2">⚠</span>
            Você pode <strong>revogar</strong> este consentimento a qualquer momento
          </li>
        </ul>
      </div>

      {/* Your rights */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">📜 Seus Direitos (LGPD)</h3>
        <div className="text-sm text-blue-700 grid grid-cols-2 gap-2">
          <div>• Acessar seus dados</div>
          <div>• Corrigir informações</div>
          <div>• Excluir dados</div>
          <div>• Revogar consentimento</div>
          <div>• Portabilidade</div>
          <div>• Não discriminação</div>
        </div>
      </div>

      {/* Terms button */}
      <button
        onClick={() => setShowFullTerms(!showFullTerms)}
        className="w-full text-left p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-800">
            📄 Ler Termo Completo de Consentimento
          </span>
          <span className="text-gray-500">
            {showFullTerms ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Full terms (collapsible) */}
      {showFullTerms && (
        <div className="bg-white rounded-lg p-4 border text-xs text-gray-700 max-h-60 overflow-y-auto animate-slide-up">
          <h4 className="font-semibold mb-2">TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS BIOMÉTRICOS</h4>
          <p className="mb-2">
            <strong>1. IDENTIFICAÇÃO:</strong> Eu, ao fornecer meus dados pessoais, AUTORIZO o tratamento 
            de meus dados pessoais e biométricos para fins de controle de acesso ao evento <em>Mega</em> Feira 2025.
          </p>
          <p className="mb-2">
            <strong>2. DADOS COLETADOS:</strong> Nome completo, CPF, email (opcional), telefone (opcional) e 
            fotografia facial para extração de template biométrico.
          </p>
          <p className="mb-2">
            <strong>3. FINALIDADE:</strong> Exclusivamente para identificação e controle de acesso ao evento 
            através de terminais de reconhecimento facial.
          </p>
          <p className="mb-2">
            <strong>4. PRAZO:</strong> Os dados serão mantidos por 90 dias após o término do evento, 
            sendo automaticamente excluídos após este período.
          </p>
          <p className="mb-2">
            <strong>5. SEGURANÇA:</strong> Seus dados são criptografados com AES-256 e armazenados com 
            segurança, em conformidade com a LGPD.
          </p>
          <p>
            <strong>6. CONTATO:</strong> Para exercer seus direitos ou tirar dúvidas, entre em contato: 
            privacy@megafeira.com
          </p>
        </div>
      )}

      {/* Checkboxes */}
      <div className="space-y-4">
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasReadTerms}
            onChange={(e) => setHasReadTerms(e.target.checked)}
            className="mt-1 h-5 w-5 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">
            Li e compreendi as informações sobre o tratamento dos meus dados pessoais e biométricos
          </span>
        </label>

        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptsTerms}
            onChange={(e) => setAcceptsTerms(e.target.checked)}
            className="mt-1 h-5 w-5 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">
            <strong>AUTORIZO</strong> o tratamento dos meus dados pessoais e biométricos conforme descrito acima
          </span>
        </label>
      </div>

      {/* Action button */}
      <button
        onClick={handleAccept}
        disabled={!acceptsTerms || !hasReadTerms}
        className={`w-full py-4 rounded-lg font-semibold transition-all ${
          acceptsTerms && hasReadTerms
            ? 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {acceptsTerms && hasReadTerms ? '✓ Aceitar e Continuar' : '⚠ Complete os checkboxes acima'}
      </button>

      {/* Help info */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          💡 Sem este consentimento não será possível acessar o evento<br/>
          📞 Dúvidas? Entre em contato: privacy@megafeira.com
        </p>
      </div>
    </div>
  )
}