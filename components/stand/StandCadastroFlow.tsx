'use client'

import { useState } from 'react'
import Link from 'next/link'
import DynamicForm from '../DynamicForm'
import UniversalFaceCapture from '../UniversalFaceCapture'
import MegaFeiraLogo from '../MegaFeiraLogo'

/**
 * Fluxo de cadastro de credenciado via link do stand (SPEC seção 2.3).
 * Consentimento → Dados (sem seleção de stand) → Foto → Sucesso.
 * O stand vem do token, validado no servidor a cada submissão.
 */

interface StandCadastroFlowProps {
  token: string
  stand: {
    name: string
    code: string
    location: string | null
    maxRegistrations: number
    activeCount: number
  }
  event: {
    name: string
    code: string
    logoUrl: string | null
  }
  requireFace: boolean
}

interface RegistrationData {
  name: string
  cpf: string
  email?: string
  phone: string
  consent: boolean
  customData?: any
}

export default function StandCadastroFlow({ token, stand, event, requireFace }: StandCadastroFlowProps) {
  const isFull = stand.activeCount >= stand.maxRegistrations

  const [step, setStep] = useState<'consent' | 'personal' | 'capture' | 'success'>('consent')
  const [consentChecked, setConsentChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registeredName, setRegisteredName] = useState('')
  const [data, setData] = useState<RegistrationData>({
    name: '',
    cpf: '',
    phone: '',
    consent: false
  })

  const handlePersonalSubmit = (formData: any) => {
    const { name, cpf, email, phone, evento, eventCode, mesa, estande, standCode, ...custom } = formData
    const updated: RegistrationData = {
      ...data,
      name,
      cpf,
      email,
      phone,
      customData: custom
    }
    setData(updated)
    if (requireFace) {
      setStep('capture')
    } else {
      submit('', undefined, updated)
    }
  }

  const submit = async (imageData: string, faceData?: any, override?: RegistrationData) => {
    setIsSubmitting(true)
    const reg = override || data

    try {
      const response = await fetch('/api/stand-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: reg.name || '',
          cpf: reg.cpf || '',
          email: reg.email || '',
          phone: reg.phone || '',
          faceImage: imageData || null,
          faceData,
          consent: reg.consent,
          customData: reg.customData || {}
        })
      })

      if (response.ok) {
        setRegisteredName(reg.name)
        setStep('success')
        return
      }

      let message = `Erro no servidor (${response.status})`
      try {
        const err = await response.json()
        message = err.message || err.error || message
      } catch {}
      alert(`Erro no cadastro: ${message}`)

      if (message.includes('lotado')) {
        // Recarrega para refletir a ocupação atual vinda do servidor
        window.location.reload()
        return
      }
      setStep('personal')
    } catch {
      alert('Erro de conexão. Verifique sua internet e tente novamente.')
      setStep('personal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const header = (
    <div className="text-center py-4">
      <div className="mb-3 flex justify-center">
        {event.logoUrl ? (
          <div className="bg-white rounded-2xl shadow-lg px-5 py-3" style={{ maxWidth: '260px' }}>
            <img src={event.logoUrl} alt={event.name} className="max-h-20 w-auto object-contain" />
          </div>
        ) : (
          <MegaFeiraLogo className="text-4xl" showTagline />
        )}
      </div>
      <h1 className="text-xl font-bold text-white mb-1">{event.name}</h1>
      <p className="text-sm text-verde-agua font-semibold">
        Stand {stand.name}
        {stand.location && <span className="text-white/50 font-normal"> — {stand.location}</span>}
      </p>
    </div>
  )

  if (isFull && step !== 'success') {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 max-w-md text-center border border-white/20">
          <div className="text-5xl mb-4">🎫</div>
          <h1 className="text-2xl font-bold text-white mb-2">Stand Lotado</h1>
          <p className="text-white/70 mb-6">
            O stand <strong className="text-verde-agua">{stand.name}</strong> atingiu o limite de{' '}
            {stand.maxRegistrations} credenciados. Fale com o responsável do stand para liberar uma vaga.
          </p>
          <Link
            href={`/stand/${token}`}
            className="inline-block px-6 py-3 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark transition-colors"
          >
            Ver painel do stand
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'consent') {
    return (
      <div className="min-h-screen gradient-hero">
        <div className="p-4 safe-area pb-28">
          <div className="max-w-md mx-auto">
            {header}

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4 border border-white/20">
              <p className="text-sm text-white/90 leading-relaxed">
                Para emitir sua credencial coletamos <strong>nome, CPF, contato e foto facial</strong>{' '}
                (reconhecimento biométrico no acesso ao evento). Os dados são criptografados, usados
                apenas para o controle de acesso e excluídos automaticamente após o evento, conforme
                a LGPD (Lei 13.709/2018). Você pode solicitar a exclusão a qualquer momento à
                organização.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  className="mt-0.5 h-5 w-5 accent-verde-agua flex-shrink-0"
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span className="text-sm text-white/90 select-none leading-relaxed">
                  Li e aceito o tratamento dos meus dados pessoais e biométricos para credenciamento
                  e controle de acesso ao evento
                </span>
              </label>
            </div>
          </div>
        </div>

        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-4 bg-gradient-to-t from-azul-marinho via-azul-marinho/98 to-transparent"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => {
                if (!consentChecked) return
                setData((prev) => ({ ...prev, consent: true }))
                setStep('personal')
              }}
              disabled={!consentChecked}
              className={`w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 shadow-lg ${
                consentChecked
                  ? 'bg-verde-agua text-white hover:bg-verde-agua-dark glow-verde-agua active:scale-95'
                  : 'bg-white/10 text-white/40 cursor-not-allowed'
              }`}
            >
              {consentChecked ? 'Aceitar e Continuar →' : 'Marque a caixa acima para continuar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'personal') {
    return (
      <div className="min-h-screen gradient-hero">
        <div className="p-4 safe-area pb-6">
          <div className="max-w-md mx-auto">
            {header}
            <DynamicForm
              onSubmit={handlePersonalSubmit}
              onBack={() => setStep('consent')}
              eventCode={event.code}
              fixedStand={{ name: stand.name, code: stand.code, location: stand.location }}
              initialData={{
                name: data.name,
                cpf: data.cpf,
                email: data.email,
                phone: data.phone,
                ...data.customData
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (step === 'capture') {
    return (
      <div className="min-h-screen gradient-hero">
        <div className="p-4 safe-area pb-6">
          <div className="max-w-md mx-auto">
            {header}
            <div className="text-center mb-3">
              <h2 className="text-lg font-bold text-white">Foto para Credencial</h2>
              <p className="text-sm text-white/70">Posicione seu rosto e tire a foto</p>
            </div>
            {isSubmitting ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-3 animate-pulse">⏳</div>
                <p className="text-white/80">Enviando cadastro...</p>
              </div>
            ) : (
              <UniversalFaceCapture onCapture={submit} onBack={() => setStep('personal')} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // success
  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-verde-agua/30 mb-6">
          <div className="text-6xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-verde-agua mb-2">Cadastro Realizado!</h1>
          <p className="text-sm text-white/80">
            Olá, <strong className="text-white">{registeredName}</strong>!<br />
            Seu cadastro no stand <strong className="text-verde-agua">{stand.name}</strong> foi
            concluído.
          </p>
        </div>
        <Link
          href={`/stand/${token}`}
          className="block w-full py-4 bg-verde-agua text-white rounded-xl font-semibold text-base hover:bg-verde-agua-dark transition-all duration-200 shadow-lg glow-verde-agua active:scale-95 mb-3"
        >
          Ver painel do stand
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-white/10 text-white/80 rounded-xl font-medium hover:bg-white/20 transition-colors"
        >
          Cadastrar outra pessoa
        </button>
      </div>
    </div>
  )
}
