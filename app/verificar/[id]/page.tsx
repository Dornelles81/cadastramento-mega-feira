'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import MegaFeiraLogo from '../../../components/MegaFeiraLogo'

interface VerificationData {
  valid: boolean
  verified: boolean
  participant: {
    id: string
    shortId: string
    name: string
    cpf: string
    email?: string
    phone?: string
    faceImageUrl?: string
    approvalStatus: string
    registeredAt: string
  }
  event: {
    name: string
    code: string
    status: string
    startDate: string
    endDate: string
    isActive: boolean
    isWithinDates: boolean
  } | null
  stand: {
    code: string
    name: string
  } | null
  status: {
    isApproved: boolean
    isPending: boolean
    isRejected: boolean
    canEnter: boolean
    message: string
  }
  verifiedAt: string
}

export default function VerificarPage() {
  const params = useParams()
  const id = params?.id as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<VerificationData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      verifyParticipant()
    }
  }, [id])

  const verifyParticipant = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/verificar/${id}`)
      const result = await response.json()

      if (response.ok) {
        setData(result)
      } else {
        setError(result.message || 'Participante não encontrado')
      }
    } catch (err) {
      setError('Erro ao verificar participante')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🔍</div>
          <p className="text-white/80 text-lg">Verificando...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-8 max-w-md text-center border border-white/20">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Verificação Falhou
          </h1>
          <p className="text-white/70 mb-6">
            {error || 'Não foi possível verificar este QR Code.'}
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark transition-colors"
          >
            Voltar ao Início
          </a>
        </div>
      </div>
    )
  }

  const { participant, event, stand, status } = data

  return (
    <div className="min-h-screen gradient-hero p-4 safe-area">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center py-6">
          <div className="mb-4">
            <MegaFeiraLogo className="text-4xl" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            Verificação de Credencial
          </h1>
        </div>

        {/* Status Card */}
        <div className={`rounded-xl shadow-lg p-6 mb-6 ${
          status.canEnter
            ? 'bg-green-500/20 border-2 border-green-400'
            : status.isRejected
              ? 'bg-red-500/20 border-2 border-red-400'
              : 'bg-yellow-500/20 border-2 border-yellow-400'
        }`}>
          <div className="text-center">
            <div className="text-5xl mb-3">
              {status.canEnter ? '✅' : status.isRejected ? '❌' : '⏳'}
            </div>
            <h2 className={`text-xl font-bold mb-2 ${
              status.canEnter ? 'text-green-400' : status.isRejected ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {status.canEnter ? 'ACESSO LIBERADO' : status.isRejected ? 'ACESSO NEGADO' : 'PENDENTE'}
            </h2>
            <p className="text-white/80 text-sm">
              {status.message}
            </p>
          </div>
        </div>

        {/* Participant Info */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-6 mb-6 border border-white/20">
          <div className="flex items-start gap-4">
            {/* Photo */}
            {participant.faceImageUrl ? (
              <img
                src={participant.faceImageUrl}
                alt={participant.name}
                className="w-20 h-20 rounded-full object-cover border-2 border-verde-agua"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-3xl">👤</span>
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white mb-1">
                {participant.name}
              </h3>
              <p className="text-sm text-white/60 font-mono mb-2">
                ID: {participant.shortId}
              </p>
              {stand && (
                <div className="inline-flex items-center px-2 py-1 bg-verde-agua/20 rounded text-sm text-verde-agua">
                  🏪 {stand.name || stand.code}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/20 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">CPF:</span>
              <span className="text-white font-mono">{participant.cpf}</span>
            </div>
            {participant.email && (
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Email:</span>
                <span className="text-white">{participant.email}</span>
              </div>
            )}
            {participant.phone && (
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Telefone:</span>
                <span className="text-white">{participant.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Event Info */}
        {event && (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-6 mb-6 border border-white/20">
            <h4 className="text-sm font-semibold text-verde-agua mb-3">EVENTO</h4>
            <p className="text-white font-bold mb-2">{event.name}</p>
            <div className="text-sm text-white/60">
              <p>Código: {event.code}</p>
              <p>Status: {event.isActive ? '🟢 Ativo' : '🔴 Inativo'}</p>
            </div>
          </div>
        )}

        {/* Verification Time */}
        <div className="text-center text-xs text-white/40">
          <p>Verificado em: {new Date(data.verifiedAt).toLocaleString('pt-BR')}</p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/50">
            Sistema de Cadastramento Facial para Eventos
          </p>
        </div>
      </div>
    </div>
  )
}
