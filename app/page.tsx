'use client'

import { useState } from 'react'

interface RegistrationData {
  name: string
  cpf: string
  email?: string
  phone: string
  event: string
  mesa: string
  consent: boolean
  faceImage?: string
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState<'consent' | 'personal' | 'capture' | 'success'>('consent')
  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    name: '',
    cpf: '',
    phone: '',
    event: '',
    mesa: '',
    consent: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConsentAccept = () => {
    setRegistrationData(prev => ({ ...prev, consent: true }))
    setCurrentStep('personal')
  }

  const handlePersonalDataSubmit = (data: Partial<RegistrationData>) => {
    setRegistrationData(prev => ({ ...prev, ...data }))
    setCurrentStep('capture')
  }

  const handleFaceCaptured = async (imageData: string) => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/register-dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...registrationData,
          faceImage: imageData
        })
      })

      if (response.ok) {
        setCurrentStep('success')
      } else {
        throw new Error('Erro no cadastro')
      }
    } catch (error) {
      console.error('Registration error:', error)
      alert('Erro no cadastro. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (currentStep === 'consent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100 p-4">
        <div className="max-w-lg mx-auto">
          {/* Admin Access Icon - Top Right */}
          <div className="absolute top-4 right-4">
            <a
              href="/admin"
              className="inline-flex items-center justify-center w-12 h-12 bg-feira-800 text-white rounded-full hover:bg-feira-700 transition-colors shadow-lg"
              title="Área Administrativa"
            >
              <span className="text-xl">⚙️</span>
            </a>
          </div>
          
          <div className="text-center py-8">
            <div className="mb-6 flex justify-center">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-24 w-auto logo-pulse"
              />
            </div>
            <h1 className="text-2xl font-bold text-feira-800 mb-2">
              Consentimento LGPD
            </h1>
            <p className="text-gray-600 mb-8">
              Precisamos da sua autorização para coletar dados biométricos
            </p>
          </div>

          <div className="card-mega p-6 space-y-4">
            <div className="bg-mega-50 p-4 rounded-lg border border-mega-200">
              <h3 className="font-semibold text-mega-800 mb-2">✅ O que coletamos:</h3>
              <ul className="text-sm text-mega-700 space-y-1">
                <li>• Seu nome e CPF</li>
                <li>• Sua foto facial</li>
                <li>• Dados de consentimento</li>
              </ul>
            </div>

            <div className="bg-feira-50 p-4 rounded-lg border border-feira-200">
              <h3 className="font-semibold text-feira-800 mb-2">🎯 Finalidade:</h3>
              <p className="text-sm text-feira-700">
                Controle de acesso à Mega Feira via reconhecimento facial
              </p>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <h3 className="font-semibold text-yellow-800 mb-2">⏰ Retenção:</h3>
              <p className="text-sm text-yellow-700">
                Seus dados serão automaticamente excluídos em 90 dias
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-start space-x-3 cursor-pointer bg-white p-4 rounded-lg">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 text-mega-600 rounded"
                onChange={() => {}}
              />
              <span className="text-sm text-gray-700">
                Li e compreendi as informações sobre tratamento dos meus dados
              </span>
            </label>

            <button
              onClick={handleConsentAccept}
              className="btn-mega w-full"
            >
              ✅ Aceitar e Continuar
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === 'personal') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100 p-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-16 w-auto"
              />
            </div>
            <h1 className="text-2xl font-bold text-feira-800 mb-2">
              Dados Pessoais
            </h1>
            <p className="text-gray-600">
              Preencha seus dados para o cadastro
            </p>
          </div>

          <form 
            className="bg-white rounded-lg p-6 shadow-sm space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.target as HTMLFormElement)
              handlePersonalDataSubmit({
                name: formData.get('name') as string,
                cpf: formData.get('cpf') as string,
                event: formData.get('event') as string,
                mesa: formData.get('mesa') as string,
                email: formData.get('email') as string || undefined,
                phone: formData.get('phone') as string || undefined,
              })
            }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome Completo *
              </label>
              <input
                name="name"
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="Digite seu nome completo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CPF *
              </label>
              <input
                name="cpf"
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Evento *
              </label>
              <select
                name="event"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white"
              >
                <option value="">Selecione o evento</option>
                <option value="expointer">Expointer</option>
                <option value="freio-de-ouro">Freio de Ouro</option>
                <option value="morfologia">Morfologia</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Número da Mesa *
              </label>
              <select
                name="mesa"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white"
              >
                <option value="">Selecione a mesa</option>
                {Array.from({ length: 83 }, (_, i) => {
                  const num = (i + 1).toString().padStart(2, '0')
                  return (
                    <option key={num} value={num}>Mesa {num}</option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email (opcional)
              </label>
              <input
                name="email"
                type="email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Telefone *
              </label>
              <input
                name="phone"
                type="tel"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="pt-4 space-y-3">
              <button
                type="submit"
                className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors"
              >
                Continuar para Captura →
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('consent')}
                className="w-full py-4 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                ← Voltar
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (currentStep === 'capture') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100 p-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-16 w-auto"
              />
            </div>
            <h1 className="text-2xl font-bold text-feira-800 mb-2">
              Captura Facial
            </h1>
            <p className="text-gray-600">
              Posicione seu rosto na tela e capture sua foto
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm space-y-6">
            <div className="aspect-[3/4] bg-gray-900 rounded-lg flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-4xl mb-4">📷</div>
                <p className="text-sm">
                  Simulação de Câmera<br/>
                  (Em produção será câmera real)
                </p>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-2">📝 Instruções:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Segure o celular na vertical</li>
                <li>• Tenha boa iluminação</li>
                <li>• Centralize seu rosto</li>
                <li>• Remova óculos escuros</li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleFaceCaptured('mock-image-data')}
                disabled={isSubmitting}
                className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? '⏳ Enviando...' : '📸 Capturar Foto (Demo)'}
              </button>

              <button
                onClick={() => setCurrentStep('personal')}
                disabled={isSubmitting}
                className="w-full py-4 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-feira-50 p-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center py-8">
            <div className="mb-6 flex justify-center">
              <img 
                src="/mega-feira-logo.svg" 
                alt="Mega Feira" 
                className="h-20 w-auto"
              />
            </div>
            <div className="text-6xl mb-4 success-bounce">✅</div>
            <h1 className="text-2xl font-bold text-mega-600 mb-2">
              Cadastro Realizado!
            </h1>
            <p className="text-gray-700">
              Parabéns, <strong>{registrationData.name}</strong>!<br/>
              Seu cadastro foi concluído com sucesso
            </p>
            <div className="mt-4 bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-2">📋 Detalhes do Cadastro:</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Evento:</strong> {registrationData.event === 'expointer' ? 'Expointer' : 
                  registrationData.event === 'freio-de-ouro' ? 'Freio de Ouro' : 'Morfologia'}</p>
                <p><strong>Mesa:</strong> {registrationData.mesa}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-mega-50 rounded-lg p-4 border border-mega-200">
              <div className="flex items-center justify-center mb-2">
                <span className="text-2xl mr-2">🏛️</span>
                <span className="font-semibold text-mega-800">Acesso Liberado</span>
              </div>
              <p className="text-sm text-mega-700 text-center">
                Você já pode acessar o camarote <strong>ABCCC</strong> usando o reconhecimento facial
              </p>
            </div>

            <div className="bg-feira-50 rounded-lg p-4 border border-feira-200">
              <div className="flex items-center justify-center mb-2">
                <span className="text-2xl mr-2">📱</span>
                <span className="font-semibold text-feira-800">Como Usar</span>
              </div>
              <p className="text-sm text-feira-700 text-center">
                No evento, aproxime seu rosto do terminal de reconhecimento facial para liberar o acesso
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <button
                onClick={() => {
                  setCurrentStep('consent')
                  setRegistrationData({ name: '', cpf: '', phone: '', event: '', mesa: '', consent: false })
                }}
                className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors"
              >
                ➕ Novo Cadastro
              </button>
              
              <div className="pt-4 text-center">
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