'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import MegaFeiraLogo from '../../../../components/MegaFeiraLogo'

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
  config: {
    logoUrl?: string
    primaryColor?: string
    secondaryColor?: string
    accentColor?: string
    welcomeMessage?: string
    requireConsent: boolean
    requireFace: boolean
    requireDocuments: boolean
  }
}

export default function EventoCadastroPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [event, setEvent] = useState<EventConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (slug) {
      loadEventConfig()
    }
  }, [slug])

  const loadEventConfig = async () => {
    try {
      const response = await fetch(`/api/public/eventos/${slug}`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Evento não encontrado')
        }
        throw new Error('Erro ao carregar evento')
      }

      const data = await response.json()
      setEvent(data.event)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-700 text-lg">Carregando evento...</p>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Evento Não Encontrado
          </h1>
          <p className="text-gray-600 mb-6">
            {error || 'O evento que você está procurando não existe ou não está mais disponível.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            ← Voltar ao Início
          </button>
        </div>
      </div>
    )
  }

  // Check if event is active
  const now = new Date()
  const startDate = new Date(event.startDate)
  const endDate = new Date(event.endDate)
  const isExpired = now > endDate
  const notStarted = now < startDate

  if (event.status !== 'active' || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Cadastro Indisponível
          </h1>
          <p className="text-gray-600 mb-6">
            {isExpired && 'Este evento já foi encerrado.'}
            {notStarted && `As inscrições para este evento abrem em ${startDate.toLocaleDateString('pt-BR')}.`}
            {event.status !== 'active' && !isExpired && !notStarted && 'Este evento não está aceitando cadastros no momento.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  // Check capacity
  const isFull = event.currentCount >= event.maxCapacity

  if (isFull) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <div className="text-6xl mb-4">🎫</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Vagas Esgotadas
          </h1>
          <p className="text-gray-600 mb-2">
            {event.name}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Atingimos a capacidade máxima de {event.maxCapacity} participantes.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  // Redirect to main registration with event parameter
  const eventParam = `?event=${slug}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-50 p-4 safe-area">
      <div className="max-w-md mx-auto">
        {/* Event Header */}
        <div className="text-center py-6">
          <div className="mb-4">
            <MegaFeiraLogo className="text-4xl" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {event.name}
          </h1>
          {event.description && (
            <p className="text-sm text-gray-600 mb-3">
              {event.description}
            </p>
          )}
          <div className="text-xs text-gray-500 space-y-1">
            <div>📅 {new Date(event.startDate).toLocaleDateString('pt-BR')} - {new Date(event.endDate).toLocaleDateString('pt-BR')}</div>
            <div>🎫 {event.currentCount}/{event.maxCapacity} vagas</div>
          </div>
        </div>

        {/* Welcome Message */}
        {event.config.welcomeMessage && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
            <p className="text-sm text-gray-700 text-center">
              {event.config.welcomeMessage}
            </p>
          </div>
        )}

        {/* Requirements */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            📋 Requisitos para Cadastro:
          </h2>
          <div className="space-y-2">
            {event.config.requireConsent && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Aceite dos termos de uso (LGPD)</span>
              </div>
            )}
            {event.config.requireFace && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Foto facial para reconhecimento</span>
              </div>
            )}
            {event.config.requireDocuments && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Upload de documentos pessoais</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>Dados pessoais (Nome, CPF, Email, Telefone)</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => router.push(`/${eventParam}`)}
          className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold text-lg shadow-md hover:bg-green-700 transition-colors"
        >
          🚀 Iniciar Cadastro
        </button>

        {/* Info */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p className="mb-2">
            Ao prosseguir, você concorda com a coleta e uso dos seus dados conforme nossa{' '}
            <a href="#" className="text-blue-600 hover:text-blue-800 underline">Política de Privacidade</a>.
          </p>
          <p>
            Código do Evento: <span className="font-mono font-semibold text-gray-700">{event.code}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
