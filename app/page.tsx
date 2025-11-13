'use client'

import { useState, useEffect } from 'react'
import DynamicForm from '../components/DynamicForm'
import UniversalFaceCapture from '../components/UniversalFaceCapture'
import MegaFeiraLogo from '../components/MegaFeiraLogo'
import { formatTextWithMarkdown } from '../utils/formatText'

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
  const [showTerms, setShowTerms] = useState(false)
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
    instructionsText: '📱 Como Usar\n\n1. Leia e aceite os termos\n2. Preencha seus dados pessoais\n3. Capture sua foto\n4. Aguarde a confirmação'
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
        let errorData: any = {}
        let errorMessage = 'Erro desconhecido'

        try {
          errorData = await response.json()
          console.error('❌ Registration failed:', errorData)

          // Better error messages
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch (jsonError) {
          console.error('Error parsing error response:', jsonError)
          errorMessage = `Erro no servidor (${response.status})`
        }

        alert(`Erro no cadastro: ${errorMessage}`)

        // Check if error is about stand limit exceeded
        if (errorData.error === 'Stand limit reached' || errorMessage.includes('limite de credenciais') || errorMessage.includes('limite')) {
          // Reload page to start over
          window.location.reload()
        }
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
                Bem-vindo ao APP Mega Feira! 🎯
              </h1>
              <p className="text-sm text-gray-600 mb-3">
                Sua experiência em feiras e eventos começa aqui.
              </p>
              <div className="text-xs text-gray-500 text-left bg-gray-50 rounded-lg p-3 mb-3">
                <p className="mb-2">
                  Com nosso aplicativo, você tem acesso rápido e seguro aos melhores eventos do setor. 
                  Através do reconhecimento facial e cadastro simplificado, garantimos:
                </p>
                <div className="space-y-1">
                  <p>✓ <strong>Entrada ágil</strong> - Sem filas, sem papel</p>
                  <p>✓ <strong>Segurança</strong> - Seus dados protegidos pela LGPD</p>
                  <p>✓ <strong>Praticidade</strong> - Tudo na palma da sua mão</p>
                </div>
                <p className="mt-3 text-center font-semibold text-gray-700">
                  Vamos começar?
                </p>
              </div>
            </div>

            {/* Steps Guide - Configurable */}
            <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
              <div 
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: formatTextWithMarkdown(textConfig.instructionsText) }}
              />
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
                  <span className="text-sm text-gray-700 select-none">Li e aceito os termos de uso e política de privacidade</span>
                </label>
                
                {/* Terms Link */}
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    📄 Ler termos completos
                  </button>
                </div>
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

        {/* Terms Modal */}
        {showTerms && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-lg font-bold text-gray-800">
                  📜 Termos de Uso e Política de Privacidade
                </h2>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4 text-sm text-gray-700">
                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">1. COLETA DE DADOS</h3>
                    <p className="mb-2">
                      Para garantir seu acesso rápido e seguro ao evento, coletamos:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Nome completo e CPF para identificação</li>
                      <li>Telefone e e-mail para comunicação</li>
                      <li>Foto facial para reconhecimento biométrico</li>
                      <li>Documentos quando solicitados pelo organizador</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">2. USO DOS DADOS</h3>
                    <p>
                      Seus dados são utilizados exclusivamente para:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Controle de acesso ao evento via reconhecimento facial</li>
                      <li>Comunicação sobre o evento</li>
                      <li>Segurança dos participantes</li>
                      <li>Estatísticas internas (dados anonimizados)</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">3. PROTEÇÃO E SEGURANÇA</h3>
                    <p>
                      Implementamos medidas técnicas e organizacionais para proteger seus dados:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Criptografia de dados sensíveis</li>
                      <li>Acesso restrito e controlado</li>
                      <li>Servidores seguros com backup</li>
                      <li>Conformidade com a LGPD (Lei 13.709/2018)</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">4. COMPARTILHAMENTO</h3>
                    <p>
                      Seus dados NÃO são vendidos ou compartilhados com terceiros para fins comerciais.
                      Compartilhamos apenas quando:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Exigido por lei ou ordem judicial</li>
                      <li>Necessário para a segurança do evento</li>
                      <li>Com seu consentimento explícito</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">5. RETENÇÃO E EXCLUSÃO</h3>
                    <p>
                      Seus dados são mantidos apenas pelo tempo necessário:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Dados do evento: 90 dias após o término</li>
                      <li>Exclusão automática após o período</li>
                      <li>Você pode solicitar exclusão a qualquer momento</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">6. SEUS DIREITOS</h3>
                    <p>
                      Conforme a LGPD, você tem direito a:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Acessar seus dados pessoais</li>
                      <li>Corrigir dados incorretos</li>
                      <li>Solicitar exclusão dos dados</li>
                      <li>Revogar consentimento</li>
                      <li>Portabilidade dos dados</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">7. CONSENTIMENTO</h3>
                    <p>
                      Ao aceitar estes termos, você autoriza expressamente a coleta e o tratamento
                      dos seus dados pessoais e biométricos para as finalidades descritas.
                      Este consentimento pode ser revogado a qualquer momento.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-semibold text-gray-800 mb-2">8. CONTATO</h3>
                    <p>
                      Para dúvidas ou solicitações sobre seus dados:
                    </p>
                    <p className="mt-2">
                      <strong>E-mail:</strong> megafeira@megafeira.com.br<br/>
                      <strong>Telefone:</strong> (51) 99977-5388
                    </p>
                  </section>

                  <div className="mt-6 pt-4 border-t">
                    <p className="text-xs text-gray-500 text-center">
                      Última atualização: 18/08/2025
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t bg-gray-50">
                <button
                  onClick={() => setShowTerms(false)}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}
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
            <UniversalFaceCapture 
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
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div 
                className="text-center text-green-800 text-sm font-medium prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatTextWithMarkdown(textConfig.successText) }}
              />
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