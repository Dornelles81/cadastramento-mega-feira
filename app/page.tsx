'use client'

import { useState, useEffect } from 'react'
import DynamicForm from '../components/DynamicForm'
import EnhancedFaceCapture from '../components/EnhancedFaceCapture'
import MegaFeiraLogo from '../components/MegaFeiraLogo'

interface RegistrationData {
  name: string
  cpf: string
  email?: string
  phone: string
  event: string
  mesa: string
  consent: boolean
  faceImage?: string
  customData?: any // For dynamic fields
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState<'consent' | 'personal' | 'capture' | 'success'>('consent')
  const [consentChecked, setConsentChecked] = useState(false)
  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    name: '',
    cpf: '',
    phone: '',
    event: '',
    mesa: '',
    consent: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [textConfig, setTextConfig] = useState({
    successText: '✅ Acesso Liberado!\n\nSeu cadastro foi realizado com sucesso.\nGuarde seu comprovante de registro.',
    instructionsText: '📱 Como Usar\n\nNo evento, aproxime seu rosto do terminal de reconhecimento facial para liberar o acesso'
  })

  // Load text configuration
  useEffect(() => {
    loadTextConfig()
  }, [])

  // Debug consent state
  useEffect(() => {
    console.log('Consent state updated:', consentChecked)
  }, [consentChecked])

  const loadTextConfig = async () => {
    try {
      // Note: Public endpoint doesn't need authentication
      const response = await fetch('/api/public/text-config')
      if (response.ok) {
        const data = await response.json()
        setTextConfig(data)
      }
    } catch (error) {
      console.error('Failed to load text config:', error)
      // Keep default values on error
    }
  }

  const handleConsentAccept = () => {
    console.log('Button clicked! Consent checked:', consentChecked)
    setRegistrationData(prev => ({ ...prev, consent: true }))
    setCurrentStep('personal')
  }

  const handlePersonalDataSubmit = (data: any) => {
    // Separate system fields from custom fields
    const { name, cpf, email, phone, eventCode, evento, mesa, ...customFields } = data
    
    // Use evento field (from dynamic form) or eventCode, with fallback
    const selectedEvent = evento || eventCode || 'MEGA-FEIRA-2025'
    const selectedMesa = mesa || ''
    
    console.log('📝 Form data received:', { name, cpf, evento, mesa })
    
    setRegistrationData(prev => ({ 
      ...prev, 
      name,
      cpf,
      email,
      phone,
      event: selectedEvent,
      mesa: selectedMesa,
      customData: customFields
    }))
    setCurrentStep('capture')
  }

  const handleFaceCaptured = async (imageData: string, faceData?: any) => {
    setIsSubmitting(true)
    
    // Debug registration data
    console.log('📸 Current registration data:', registrationData)
    
    // Ensure eventCode has a value - handle various formats
    let eventCode = registrationData.event || 'MEGA-FEIRA-2025'
    
    // If it's one of the event names, keep it, otherwise use default
    const validEvents = ['MEGA-FEIRA-2025', 'Expointer', 'Freio de Ouro', 'Morfologia', 'Leilão']
    if (!validEvents.includes(eventCode)) {
      console.warn('⚠️ Invalid event code:', eventCode, '- using default')
      eventCode = 'MEGA-FEIRA-2025'
    }
    
    const payload = {
      name: registrationData.name || '',
      cpf: registrationData.cpf && registrationData.cpf.includes('.') ? registrationData.cpf : (registrationData.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      email: registrationData.email || '',
      phone: registrationData.phone || '',
      eventCode: eventCode, // Always send a valid value
      faceImage: imageData,
      faceData: faceData, // Azure Face API data
      consent: registrationData.consent,
      customData: {
        ...registrationData.customData,
        mesa: registrationData.mesa || registrationData.customData?.mesa || ''
      }
    }
    
    console.log('📤 Sending registration payload:', {
      ...payload,
      faceImage: payload.faceImage.substring(0, 50) + '...' // Log truncated image
    })
    
    try {
      const response = await fetch('/api/register-fixed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Registration successful:', result)
        setCurrentStep('success')
      } else {
        const errorData = await response.json()
        console.error('❌ Registration failed:', errorData)
        
        // Better error messages
        let errorMessage = 'Erro desconhecido'
        if (errorData.message) {
          if (errorData.message.includes('CPF')) {
            errorMessage = 'CPF inválido. Por favor, verifique o número digitado.'
          } else if (errorData.message.includes('já está cadastrado')) {
            errorMessage = 'Este CPF já está cadastrado no sistema.'
          } else {
            errorMessage = errorData.message
          }
        }
        
        alert(`Erro no cadastro: ${errorMessage}`)
      }
    } catch (error) {
      console.error('💥 Registration error:', error)
      alert('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (currentStep === 'consent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50">
        {/* Admin Access Icon */}
        <div className="absolute top-4 right-4 z-10">
          <a
            href="/admin"
            className="inline-flex items-center justify-center w-10 h-10 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors shadow-lg"
            title="Admin"
          >
            <span className="text-lg">⚙️</span>
          </a>
        </div>

        <div className="p-4 safe-area">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center py-6">
              <div className="mb-4">
                <MegaFeiraLogo className="text-4xl" />
              </div>
              <h1 className="text-xl font-bold text-gray-800 mb-2">
                Consentimento LGPD
              </h1>
              <p className="text-sm text-gray-600">
                Precisamos da sua autorização para coletar dados biométricos
              </p>
            </div>

            {/* Info Cards */}
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4 mb-6">
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-800 text-sm mb-2">✅ O que coletamos:</h3>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>• Seu nome e CPF</li>
                  <li>• Sua foto facial</li>
                  <li>• Dados de consentimento</li>
                </ul>
              </div>

              <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                <h3 className="font-semibold text-purple-800 text-sm mb-2">🎯 Finalidade:</h3>
                <p className="text-xs text-purple-700">
                  Controle de acesso à Mega Feira via reconhecimento facial
                </p>
              </div>

              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <h3 className="font-semibold text-yellow-800 text-sm mb-2">⏰ Retenção:</h3>
                <p className="text-xs text-yellow-700">
                  Seus dados serão automaticamente excluídos em 90 dias
                </p>
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={consentChecked}
                    className="mt-0.5 h-5 w-5 accent-green-600"
                    onChange={(e) => {
                      setConsentChecked(e.target.checked)
                    }}
                  />
                  <span className="text-sm text-gray-700 select-none">
                    Li e compreendi as informações sobre tratamento dos meus dados
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (consentChecked) {
                    setRegistrationData(prev => ({ ...prev, consent: true }))
                    setCurrentStep('personal')
                  }
                }}
                disabled={!consentChecked}
                className={`w-full py-4 rounded-lg font-semibold transition-colors shadow-md ${
                  consentChecked 
                    ? 'bg-green-600 text-white hover:bg-green-700 cursor-pointer' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
              >
                ✅ Aceitar e Continuar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === 'personal') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              Dados Pessoais
            </h1>
            <p className="text-sm text-gray-600">
              Preencha seus dados para o cadastro
            </p>
          </div>

          <DynamicForm
            onSubmit={handlePersonalDataSubmit}
            onBack={() => setCurrentStep('consent')}
            eventCode={registrationData.event}
            initialData={{
              name: registrationData.name,
              cpf: registrationData.cpf
            }}
          />
        </div>
      </div>
    )
  }

  if (currentStep === 'capture') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              Captura Facial
            </h1>
            <p className="text-sm text-gray-600">
              Tire sua foto para completar o cadastro
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <EnhancedFaceCapture 
              onCapture={handleFaceCaptured}
              onBack={() => setCurrentStep('personal')}
            />
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <div className="text-5xl mb-3">✅</div>
            <h1 className="text-xl font-bold text-green-600 mb-2">
              Cadastro Realizado!
            </h1>
            <p className="text-sm text-gray-700">
              Parabéns, <strong>{registrationData.name}</strong>!<br/>
              Seu cadastro foi concluído com sucesso
            </p>
            {(registrationData.event || registrationData.mesa) && (
              <div className="mt-4 bg-white rounded-lg p-3 shadow-sm">
                <h3 className="font-semibold text-gray-800 text-sm mb-2">📋 Detalhes:</h3>
                <div className="text-xs text-gray-600 space-y-1">
                  {registrationData.event && <p><strong>Evento:</strong> {registrationData.event}</p>}
                  {registrationData.mesa && <p><strong>Mesa:</strong> {registrationData.mesa}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="text-center text-green-800 text-sm font-medium space-y-1">
                {textConfig.successText.split('\n').filter(line => line.trim()).map((line, index) => (
                  <p key={index} className={line.includes('✅') ? 'text-base font-bold' : ''}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => {
                  setCurrentStep('consent')
                  setConsentChecked(false)
                  setRegistrationData({ name: '', cpf: '', phone: '', event: '', mesa: '', consent: false })
                }}
                className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-md"
              >
                ➕ Novo Cadastro
              </button>
              
              <div className="pt-2 text-center">
                <a
                  href="/admin"
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  🔧 Área Administrativa
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}