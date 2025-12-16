'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import DynamicForm from '../../../components/DynamicForm'
import UniversalFaceCapture from '../../../components/UniversalFaceCapture'
import MegaFeiraLogo from '../../../components/MegaFeiraLogo'
import { formatTextWithMarkdown } from '../../../utils/formatText'

interface EventConfig {
  id: string
  slug: string
  name: string
  code: string
  description?: string
  startDate: string
  endDate: string
  maxCapacity: number
  currentCount: number
  status: string
  isActive: boolean
  config: {
    logoUrl?: string
    primaryColor?: string
    secondaryColor?: string
    accentColor?: string
    welcomeMessage?: string
    successMessage?: string
    consentText?: string
    requireConsent: boolean
    requireFace: boolean
    requireDocuments: boolean
  }
}

interface RegistrationData {
  name: string
  cpf: string
  email?: string
  phone: string
  eventCode: string
  mesa: string
  consent: boolean
  faceImage?: string
  customData?: any
}

export default function EventoPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  // Event state
  const [event, setEvent] = useState<EventConfig | null>(null)
  const [eventLoading, setEventLoading] = useState(true)
  const [eventError, setEventError] = useState('')

  // Registration flow state
  const [currentStep, setCurrentStep] = useState<'loading' | 'consent' | 'personal' | 'capture' | 'success'>('loading')
  const [consentChecked, setConsentChecked] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    name: '',
    cpf: '',
    phone: '',
    eventCode: '',
    mesa: '',
    consent: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [participantId, setParticipantId] = useState<string>('')
  const [textConfig, setTextConfig] = useState({
    successText: 'Acesso Liberado!\n\nSeu cadastro foi realizado com sucesso.\nGuarde seu comprovante de registro.',
    instructionsText: 'Como Usar\n\n1. Leia e aceite os termos\n2. Preencha seus dados pessoais\n3. Capture sua foto\n4. Aguarde a confirmacao'
  })

  // Load event data on mount
  useEffect(() => {
    if (slug) {
      loadEventConfig()
    }
  }, [slug])

  // Check for update mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const updateId = params.get('update')

    if (updateId && event) {
      console.log('Update mode detected for ID:', updateId)
      setIsUpdateMode(true)
      setParticipantId(updateId)
      loadParticipantData(updateId)
    }
  }, [event])

  // Load text configuration
  useEffect(() => {
    if (event) {
      loadTextConfig()
    }
  }, [event])

  const loadEventConfig = async () => {
    try {
      setEventLoading(true)
      const response = await fetch(`/api/public/eventos/${slug}`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Evento nao encontrado')
        }
        throw new Error('Erro ao carregar evento')
      }

      const data = await response.json()
      const eventData = data.event

      setEvent(eventData)
      setRegistrationData(prev => ({
        ...prev,
        eventCode: eventData.code
      }))

      // Validate event status
      const now = new Date()
      const startDate = new Date(eventData.startDate)
      const endDate = new Date(eventData.endDate)
      const isExpired = now > endDate
      const notStarted = now < startDate
      const isFull = eventData.currentCount >= eventData.maxCapacity

      if (eventData.status !== 'active') {
        if (isExpired) {
          setEventError('Este evento ja foi encerrado.')
        } else if (notStarted) {
          setEventError(`As inscricoes para este evento abrem em ${startDate.toLocaleDateString('pt-BR')}.`)
        } else {
          setEventError('Este evento nao esta aceitando cadastros no momento.')
        }
      } else if (isFull) {
        setEventError(`Vagas esgotadas. Atingimos a capacidade maxima de ${eventData.maxCapacity} participantes.`)
      } else {
        // Event is valid, proceed to consent
        setCurrentStep('consent')
      }
    } catch (err: any) {
      setEventError(err.message)
    } finally {
      setEventLoading(false)
    }
  }

  const loadTextConfig = async () => {
    try {
      const response = await fetch('/api/public/text-config')
      if (response.ok) {
        const data = await response.json()
        // Use event-specific messages if available
        setTextConfig({
          successText: event?.config?.successMessage || data.successText,
          instructionsText: data.instructionsText
        })
      }
    } catch (error) {
      console.error('Failed to load text config:', error)
    }
  }

  const loadParticipantData = async (id: string) => {
    try {
      console.log('Loading participant data for ID:', id)
      const response = await fetch(`/api/participants/get?id=${id}`)

      if (response.ok) {
        const { participant } = await response.json()
        console.log('Loaded participant data:', participant)

        const updatedData = {
          name: participant.name || '',
          cpf: participant.cpf || '',
          email: participant.email || '',
          phone: participant.phone || '',
          eventCode: event?.code || participant.eventCode || '',
          consent: true,
          customData: {
            ...participant.customData,
            etapa: participant.customData?.etapa || '',
            estande: participant.customData?.estande || '',
            standCode: participant.standCode || participant.customData?.standCode || '',
            mesa: participant.customData?.mesa || '',
            documents: participant.documents || participant.customData?.documents || {}
          }
        }

        if (participant.faceImageUrl) {
          updatedData.faceImage = participant.faceImageUrl
        }

        setRegistrationData(updatedData)
        setConsentChecked(true)
        setCurrentStep('personal')
      } else {
        console.error('Failed to load participant data')
        alert('Cadastro nao encontrado. Por favor, faca um novo cadastro.')
      }
    } catch (error) {
      console.error('Error loading participant data:', error)
      alert('Erro ao carregar dados. Por favor, tente novamente.')
    }
  }

  const handleConsentAccept = () => {
    setRegistrationData(prev => ({ ...prev, consent: true }))
    setCurrentStep('personal')
  }

  const handlePersonalDataSubmit = (data: any) => {
    const { name, cpf, email, phone, eventCode, evento, mesa, ...customFields } = data
    const selectedMesa = mesa || ''

    console.log('Form data received:', { name, cpf, evento, mesa })

    setRegistrationData(prev => ({
      ...prev,
      name,
      cpf,
      email,
      phone,
      mesa: selectedMesa,
      customData: customFields
    }))
    setCurrentStep('capture')
  }

  const handleFaceCaptured = async (imageData: string, faceData?: any) => {
    setIsSubmitting(true)

    const payload = {
      name: registrationData.name || '',
      cpf: registrationData.cpf && registrationData.cpf.includes('.')
        ? registrationData.cpf
        : (registrationData.cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      email: registrationData.email || '',
      phone: registrationData.phone || '',
      eventCode: event?.code || registrationData.eventCode,
      faceImage: imageData,
      faceData: faceData,
      consent: registrationData.consent,
      customData: {
        ...registrationData.customData,
        mesa: registrationData.mesa || registrationData.customData?.mesa || ''
      }
    }

    console.log('Sending registration payload for event:', payload.eventCode)

    try {
      const endpoint = isUpdateMode ? '/api/participants/update' : '/api/register-fixed'
      const updatePayload = isUpdateMode
        ? { ...payload, id: participantId, documents: registrationData.customData?.documents }
        : payload

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload)
      })

      if (response.ok) {
        const result = await response.json()
        console.log(isUpdateMode ? 'Update successful:' : 'Registration successful:', result)
        setCurrentStep('success')
      } else {
        let errorData: any = {}
        let errorMessage = 'Erro desconhecido'

        try {
          errorData = await response.json()
          errorMessage = errorData.message || errorData.error || 'Erro desconhecido'
        } catch (jsonError) {
          errorMessage = `Erro no servidor (${response.status})`
        }

        alert(`Erro no cadastro: ${errorMessage}`)

        if (errorData.error === 'CPF already registered' || errorMessage.includes('CPF ja')) {
          setIsSubmitting(false)
          setCurrentStep('personal')
          return
        }

        if (errorData.error === 'Stand limit reached' || errorMessage.includes('limite')) {
          window.location.reload()
          return
        }

        setIsSubmitting(false)
        setCurrentStep('personal')
      }
    } catch (error) {
      console.error('Registration error:', error)
      alert('Erro de conexao. Verifique sua internet e tente novamente.')
      setIsSubmitting(false)
      setCurrentStep('personal')
    }
  }

  const handleNewRegistration = () => {
    setCurrentStep('consent')
    setConsentChecked(false)
    setRegistrationData({
      name: '',
      cpf: '',
      phone: '',
      eventCode: event?.code || '',
      mesa: '',
      consent: false
    })
    setIsUpdateMode(false)
    setParticipantId('')
  }

  // Loading state
  if (currentStep === 'loading' || eventLoading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-white/80 text-lg">Carregando evento...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (eventError || !event) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-8 max-w-md text-center border border-white/20">
          <div className="text-6xl mb-4">
            {eventError?.includes('esgotadas') ? '🎫' : eventError?.includes('encerrado') ? '⚠️' : '❌'}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {eventError?.includes('esgotadas') ? 'Vagas Esgotadas' :
             eventError?.includes('encontrado') ? 'Evento Nao Encontrado' :
             'Cadastro Indisponivel'}
          </h1>
          <p className="text-white/70 mb-6">
            {eventError || 'O evento que voce esta procurando nao existe ou nao esta mais disponivel.'}
          </p>
          <a
            href="/admin"
            className="inline-block px-6 py-3 bg-cinza text-white rounded-lg font-semibold hover:bg-cinza-dark transition-colors"
          >
            Area Administrativa
          </a>
        </div>
      </div>
    )
  }

  // Consent step
  if (currentStep === 'consent') {
    return (
      <div className="min-h-screen gradient-hero">
        {/* Admin Access Icon */}
        <div className="absolute top-4 right-4 z-10">
          <a
            href="/admin"
            className="inline-flex items-center justify-center w-10 h-10 bg-azul-marinho text-white rounded-full hover:bg-azul-marinho-light transition-colors shadow-lg"
            title="Admin"
          >
            <span className="text-lg">⚙️</span>
          </a>
        </div>

        <div className="p-4 safe-area">
          <div className="max-w-md mx-auto">
            {/* Header with Event Info */}
            <div className="text-center py-6">
              <div className="mb-4">
                <MegaFeiraLogo className="text-4xl" showTagline />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">
                {event.name}
              </h1>
              {event.description && (
                <p className="text-sm text-white/80 mb-2">
                  {event.description}
                </p>
              )}
              <div className="text-xs text-white/60 space-y-1 mb-3">
                <div>De {new Date(event.startDate).toLocaleDateString('pt-BR')} a {new Date(event.endDate).toLocaleDateString('pt-BR')}</div>
                <div>{event.currentCount}/{event.maxCapacity} vagas preenchidas</div>
              </div>
              <div className="text-xs text-white/90 text-left bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-3 border border-white/20">
                <p className="mb-2">
                  Com nosso aplicativo, voce tem acesso rapido e seguro ao evento.
                  Atraves do reconhecimento facial e cadastro simplificado, garantimos:
                </p>
                <div className="space-y-1">
                  <p><span className="text-verde-agua">✓</span> <strong className="text-white">Entrada ágil</strong> - Sem filas, sem papel</p>
                  <p><span className="text-verde-agua">✓</span> <strong className="text-white">Segurança</strong> - Seus dados protegidos pela LGPD</p>
                  <p><span className="text-verde-agua">✓</span> <strong className="text-white">Praticidade</strong> - Tudo na palma da sua mão</p>
                </div>
                <p className="mt-3 text-center font-semibold text-verde-agua">
                  Vamos comecar?
                </p>
              </div>
            </div>

            {/* Update Mode Banner */}
            {isUpdateMode && (
              <div className="bg-azul-medio/20 border-2 border-azul-medio rounded-xl shadow-sm p-5 mb-6 backdrop-blur-sm">
                <div className="text-center">
                  <div className="text-3xl mb-2">🔄</div>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Modo de Atualizacao
                  </h3>
                  <p className="text-sm text-white/80">
                    Voce esta atualizando um cadastro existente.
                    <br />
                    Seus dados foram carregados automaticamente.
                  </p>
                </div>
              </div>
            )}

            {/* Steps Guide */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-5 mb-6 border border-white/20">
              <div
                className="prose prose-sm max-w-none text-white/90 prose-headings:text-white prose-strong:text-verde-agua prose-p:text-white/80"
                dangerouslySetInnerHTML={{ __html: formatTextWithMarkdown(textConfig.instructionsText) }}
              />
            </div>

            {/* Consent Checkbox */}
            <div className="space-y-4">
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={consentChecked}
                    className="mt-0.5 h-5 w-5 accent-verde-agua"
                    onChange={(e) => setConsentChecked(e.target.checked)}
                  />
                  <span className="text-sm text-white/90 select-none">Li e aceito os termos de uso e politica de privacidade</span>
                </label>

                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-xs text-verde-agua hover:text-verde-agua-light underline"
                  >
                    Ler termos completos
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (consentChecked) {
                    handleConsentAccept()
                  }
                }}
                disabled={!consentChecked}
                className={`w-full py-4 rounded-lg font-semibold transition-all duration-200 shadow-md ${
                  consentChecked
                    ? 'bg-verde-agua text-white hover:bg-verde-agua-dark cursor-pointer glow-verde-agua'
                    : 'bg-cinza-600 text-cinza-400 cursor-not-allowed opacity-60'
                }`}
              >
                Aceitar e Continuar
              </button>
            </div>
          </div>
        </div>

        {/* Terms Modal */}
        {showTerms && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-azul-marinho rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden border border-white/20">
              <div className="p-6 border-b border-white/20">
                <h2 className="text-lg font-bold text-white">
                  Termos de Uso e Politica de Privacidade
                </h2>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4 text-sm text-white/90">
                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">1. COLETA DE DADOS</h3>
                    <p className="mb-2">
                      Para garantir seu acesso rapido e seguro ao evento, coletamos:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Nome completo e CPF para identificacao</li>
                      <li>Telefone e e-mail para comunicacao</li>
                      <li>Foto facial para reconhecimento biometrico</li>
                      <li>Documentos quando solicitados pelo organizador</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">2. USO DOS DADOS</h3>
                    <p>
                      Seus dados sao utilizados exclusivamente para:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Controle de acesso ao evento via reconhecimento facial</li>
                      <li>Comunicacao sobre o evento</li>
                      <li>Seguranca dos participantes</li>
                      <li>Estatisticas internas (dados anonimizados)</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">3. PROTECAO E SEGURANCA</h3>
                    <p>
                      Implementamos medidas tecnicas e organizacionais para proteger seus dados:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Criptografia de dados sensiveis</li>
                      <li>Acesso restrito e controlado</li>
                      <li>Servidores seguros com backup</li>
                      <li>Conformidade com a LGPD (Lei 13.709/2018)</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">4. COMPARTILHAMENTO</h3>
                    <p>
                      Seus dados NAO sao vendidos ou compartilhados com terceiros para fins comerciais.
                      Compartilhamos apenas quando:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Exigido por lei ou ordem judicial</li>
                      <li>Necessario para a seguranca do evento</li>
                      <li>Com seu consentimento explicito</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">5. RETENCAO E EXCLUSAO</h3>
                    <p>
                      Seus dados sao mantidos apenas pelo tempo necessario:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Dados do evento: 90 dias apos o termino</li>
                      <li>Exclusao automatica apos o periodo</li>
                      <li>Voce pode solicitar exclusao a qualquer momento</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">6. SEUS DIREITOS</h3>
                    <p>
                      Conforme a LGPD, voce tem direito a:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 mt-2">
                      <li>Acessar seus dados pessoais</li>
                      <li>Corrigir dados incorretos</li>
                      <li>Solicitar exclusao dos dados</li>
                      <li>Revogar consentimento</li>
                      <li>Portabilidade dos dados</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">7. CONSENTIMENTO</h3>
                    <p>
                      Ao aceitar estes termos, voce autoriza expressamente a coleta e o tratamento
                      dos seus dados pessoais e biometricos para as finalidades descritas.
                      Este consentimento pode ser revogado a qualquer momento.
                    </p>
                  </section>

                  <section>
                    <h3 className="font-semibold text-verde-agua mb-2">8. CONTATO</h3>
                    <p>
                      Para duvidas ou solicitacoes sobre seus dados:
                    </p>
                    <p className="mt-2">
                      <strong>E-mail:</strong> megafeira@megafeira.com.br<br/>
                      <strong>Telefone:</strong> (51) 99977-5388
                    </p>
                  </section>

                  <div className="mt-6 pt-4 border-t border-white/20">
                    <p className="text-xs text-white/60 text-center">
                      Ultima atualizacao: 18/08/2025
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/20 bg-azul-marinho-dark">
                <button
                  onClick={() => setShowTerms(false)}
                  className="w-full py-3 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark transition-colors"
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

  // Personal data step
  if (currentStep === 'personal') {
    return (
      <div className="min-h-screen gradient-hero p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Dados Pessoais
            </h1>
            <p className="text-sm text-white/80">
              Preencha seus dados para o cadastro em <strong className="text-verde-agua">{event.name}</strong>
            </p>
          </div>

          <DynamicForm
            onSubmit={handlePersonalDataSubmit}
            onBack={() => setCurrentStep('consent')}
            eventCode={event.code}
            initialData={{
              name: registrationData.name,
              cpf: registrationData.cpf,
              email: registrationData.email,
              phone: registrationData.phone,
              evento: event.code,
              mesa: registrationData.customData?.mesa,
              ...registrationData.customData
            }}
          />
        </div>
      </div>
    )
  }

  // Face capture step
  if (currentStep === 'capture') {
    return (
      <div className="min-h-screen gradient-hero p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Captura Facial
            </h1>
            <p className="text-sm text-white/80">
              Tire sua foto para completar o cadastro
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
            <UniversalFaceCapture
              onCapture={handleFaceCaptured}
              onBack={() => setCurrentStep('personal')}
            />
          </div>
        </div>
      </div>
    )
  }

  // Success step
  if (currentStep === 'success') {
    return (
      <div className="min-h-screen gradient-hero p-4 safe-area">
        <div className="max-w-md mx-auto">
          <div className="text-center py-6">
            <div className="mb-4">
              <MegaFeiraLogo className="text-3xl" />
            </div>
            <div className="text-5xl mb-3">{isUpdateMode ? '🔄' : '✅'}</div>
            <h1 className="text-xl font-bold text-verde-agua mb-2">
              {isUpdateMode ? 'Cadastro Atualizado!' : 'Cadastro Realizado!'}
            </h1>
            <p className="text-sm text-white/80">
              Parabens, <strong className="text-white">{registrationData.name}</strong>!<br/>
              {isUpdateMode
                ? 'Seus dados foram atualizados com sucesso'
                : `Seu cadastro para ${event.name} foi concluido com sucesso`}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-verde/20 backdrop-blur-sm rounded-lg p-4 border border-verde/40">
              <div
                className="text-center text-white text-sm font-medium prose prose-sm max-w-none prose-headings:text-verde-agua"
                dangerouslySetInnerHTML={{ __html: formatTextWithMarkdown(textConfig.successText) }}
              />
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleNewRegistration}
                className="w-full py-4 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark transition-all duration-200 shadow-md glow-verde-agua"
              >
                Novo Cadastro
              </button>

              <div className="pt-2 text-center">
                <a
                  href="/admin"
                  className="text-xs text-white/60 hover:text-white/80 transition-colors"
                >
                  Area Administrativa
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
