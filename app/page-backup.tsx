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
    
    const payload = {
      name: registrationData.name,
      cpf: registrationData.cpf.includes('.') ? registrationData.cpf : registrationData.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      email: registrationData.email || '',
      phone: registrationData.phone,
      eventCode: registrationData.event,
      faceImage: imageData,
      consent: registrationData.consent
    }
    
    console.log('📤 Sending registration data:', payload)
    
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
        alert(`Erro no cadastro: ${errorData.message || errorData.error || 'Erro desconhecido'}`)
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
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100">
        {/* Admin Access Icon */}
        <div className="absolute top-4 right-4 z-10">
          <a
            href="/admin"
            className="inline-flex items-center justify-center w-12 h-12 bg-feira-800 text-white rounded-full hover:bg-feira-700 transition-colors shadow-lg"
            title="Área Administrativa"
          >
            <span className="text-xl">⚙️</span>
          </a>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden p-4">
          <div className="max-w-lg mx-auto">
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

        {/* Desktop Layout */}
        <div className="hidden lg:flex lg:items-center lg:justify-center lg:min-h-screen lg:p-8 lg:px-12">
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid lg:grid-cols-5 lg:gap-12 lg:items-center">
              {/* Left Side - Hero Content */}
              <div className="lg:col-span-3 space-y-8">
                <div className="text-center lg:text-left">
                  <div className="mb-8 flex justify-center lg:justify-start">
                    <img 
                      src="/mega-feira-logo.svg" 
                      alt="Mega Feira" 
                      className="h-32 w-auto logo-pulse"
                    />
                  </div>
                  <h1 className="text-4xl font-bold text-feira-800 mb-4">
                    Cadastro Biométrico
                  </h1>
                  <p className="text-xl text-gray-600 mb-8">
                    Acesso rápido e seguro via reconhecimento facial
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🔒</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-1">Segurança Total</h3>
                      <p className="text-gray-600">Dados criptografados e conformidade LGPD</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">⚡</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-1">Acesso Instantâneo</h3>
                      <p className="text-gray-600">Sem filas, sem cartões, apenas seu rosto</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🗑️</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-1">Auto-Exclusão</h3>
                      <p className="text-gray-600">Dados deletados automaticamente em 90 dias</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Form */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-feira-800 mb-2">
                      Consentimento LGPD
                    </h2>
                    <p className="text-gray-600">
                      Precisamos da sua autorização para continuar
                    </p>
                  </div>

                  <div className="space-y-4 mb-8">
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
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-start space-x-3 cursor-pointer bg-gray-50 p-4 rounded-lg hover:bg-gray-100 transition-colors">
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
                      className="w-full py-4 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors text-lg"
                    >
                      ✅ Aceitar e Continuar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === 'personal') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100 p-4 lg:p-8 lg:px-12">
        {/* Mobile Layout */}
        <div className="lg:hidden max-w-lg mx-auto">
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
            {/* Mobile form fields here - keeping original mobile layout */}
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
            {/* Add other mobile fields... */}
          </form>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:flex lg:items-center lg:justify-center lg:min-h-screen">
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid lg:grid-cols-5 lg:gap-16 lg:items-start">
              {/* Left Side - Progress & Info */}
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <div className="mb-8">
                    <img 
                      src="/mega-feira-logo.svg" 
                      alt="Mega Feira" 
                      className="h-24 w-auto"
                    />
                  </div>
                  
                  {/* Progress Steps */}
                  <div className="flex items-center space-x-4 mb-8">
                    <div className="flex items-center space-x-2">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">✓</span>
                      </div>
                      <span className="text-sm text-green-600 font-medium">Consentimento</span>
                    </div>
                    <div className="flex-1 h-px bg-green-300"></div>
                    <div className="flex items-center space-x-2">
                      <div className="w-10 h-10 bg-mega-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">2</span>
                      </div>
                      <span className="text-sm text-mega-600 font-medium">Dados Pessoais</span>
                    </div>
                    <div className="flex-1 h-px bg-gray-300"></div>
                    <div className="flex items-center space-x-2">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-gray-500 text-sm font-bold">3</span>
                      </div>
                      <span className="text-sm text-gray-500">Captura Facial</span>
                    </div>
                  </div>

                  <h1 className="text-4xl font-bold text-feira-800 mb-6">
                    Seus Dados Pessoais
                  </h1>
                  <p className="text-xl text-gray-600 mb-8">
                    Preencha as informações para finalizar seu cadastro biométrico
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-blue-600 text-2xl">📝</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg mb-1">Informações Básicas</h3>
                      <p className="text-gray-600">Nome completo e CPF são obrigatórios para identificação</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <span className="text-purple-600 text-2xl">🎪</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg mb-1">Evento e Mesa</h3>
                      <p className="text-gray-600">Selecione o evento e número da sua mesa reservada</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <span className="text-green-600 text-2xl">📱</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg mb-1">Informações de Contato</h3>
                      <p className="text-gray-600">Email é opcional, telefone é obrigatório para confirmações</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Form */}
              <div className="lg:col-span-3">
                <div className="bg-white rounded-2xl shadow-xl p-10">
                  <div className="mb-8">
                    <h2 className="text-3xl font-bold text-feira-800 mb-3">
                      Preencha seus dados
                    </h2>
                    <p className="text-gray-600 text-lg">
                      Todas as informações são seguras e criptografadas
                    </p>
                  </div>

                  <form 
                    className="space-y-8"
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
                    {/* Name and CPF Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Nome Completo *
                        </label>
                        <input
                          name="name"
                          type="text"
                          required
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 transition-colors"
                          placeholder="Digite seu nome completo"
                        />
                      </div>
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          CPF *
                        </label>
                        <input
                          name="cpf"
                          type="text"
                          required
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 transition-colors"
                          placeholder="000.000.000-00"
                          maxLength={14}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '')
                            const formatted = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                            e.target.value = formatted
                          }}
                        />
                      </div>
                    </div>

                    {/* Event and Table Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Evento *
                        </label>
                        <select
                          name="event"
                          required
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white transition-colors"
                        >
                          <option value="">Selecione o evento</option>
                          <option value="expointer">Expointer</option>
                          <option value="freio-de-ouro">Freio de Ouro</option>
                          <option value="morfologia">Morfologia</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Mesa *
                        </label>
                        <select
                          name="mesa"
                          required
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white transition-colors"
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
                    </div>

                    {/* Contact Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Email <span className="text-gray-500 font-normal">(opcional)</span>
                        </label>
                        <input
                          name="email"
                          type="email"
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 transition-colors"
                          placeholder="seu@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Telefone *
                        </label>
                        <input
                          name="phone"
                          type="tel"
                          required
                          className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 transition-colors"
                          placeholder="(11) 99999-9999"
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '')
                            const formatted = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
                            e.target.value = formatted
                          }}
                        />
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex space-x-6 pt-6">
                      <button
                        type="submit"
                        className="flex-1 py-5 bg-mega-500 text-white rounded-xl font-bold text-xl hover:bg-mega-600 transition-colors shadow-lg hover:shadow-xl"
                      >
                        Continuar para Captura →
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentStep('consent')}
                        className="px-10 py-5 bg-gray-200 text-gray-800 rounded-xl font-bold text-xl hover:bg-gray-300 transition-colors"
                      >
                        ← Voltar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )

          <form 
            className="bg-white rounded-lg lg:rounded-xl p-6 lg:p-8 shadow-sm lg:shadow-lg space-y-4 lg:space-y-6"
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
                className="w-full px-4 py-3 lg:py-4 border border-gray-300 rounded-lg text-base lg:text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 transition-colors"
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
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  const formatted = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                  e.target.value = formatted
                }}
              />
            </div>

            <div className="lg:grid lg:grid-cols-2 lg:gap-4">
              <div>
                <label className="block text-sm lg:text-base font-medium text-gray-700 mb-2">
                  Evento *
                </label>
                <select
                  name="event"
                  required
                  className="w-full px-4 py-3 lg:py-4 border border-gray-300 rounded-lg text-base lg:text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white transition-colors"
                >
                  <option value="">Selecione o evento</option>
                  <option value="expointer">Expointer</option>
                  <option value="freio-de-ouro">Freio de Ouro</option>
                  <option value="morfologia">Morfologia</option>
                </select>
              </div>

              <div>
                <label className="block text-sm lg:text-base font-medium text-gray-700 mb-2">
                  Número da Mesa *
                </label>
                <select
                  name="mesa"
                  required
                  className="w-full px-4 py-3 lg:py-4 border border-gray-300 rounded-lg text-base lg:text-lg focus:ring-2 focus:ring-mega-500 focus:border-mega-500 bg-white transition-colors"
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
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  const formatted = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
                  e.target.value = formatted
                }}
              />
            </div>

            <div className="pt-4 space-y-3 lg:flex lg:space-y-0 lg:space-x-4 lg:pt-6">
              <button
                type="submit"
                className="w-full lg:flex-1 py-4 lg:py-4 bg-mega-500 text-white rounded-lg lg:rounded-xl font-semibold text-base lg:text-lg hover:bg-mega-600 transition-colors"
              >
                Continuar para Captura →
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('consent')}
                className="w-full lg:w-auto lg:px-8 py-4 bg-gray-200 text-gray-800 rounded-lg lg:rounded-xl font-semibold text-base lg:text-lg hover:bg-gray-300 transition-colors"
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
                onClick={() => handleFaceCaptured('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==')}
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