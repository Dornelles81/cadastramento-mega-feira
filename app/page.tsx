'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MegaFeiraLogo from '../components/MegaFeiraLogo'

// Helper function to format date without timezone conversion issues
const formatEventDate = (dateString: string): string => {
  if (!dateString) return ''
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}/${month}/${year}`
  }
  return new Date(dateString).toLocaleDateString('pt-BR')
}

interface EventSummary {
  slug: string
  name: string
  startDate: string
  endDate: string
  status: string
  currentCount: number
  maxCapacity: number
}

function HomePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeEvents, setActiveEvents] = useState<EventSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for event parameter - redirect to event page
    const eventSlug = searchParams.get('event')
    if (eventSlug) {
      router.replace(`/eventos/${eventSlug}`)
      return
    }

    // Check for update parameter - redirect to participant's event page with update mode
    const updateId = searchParams.get('update')
    if (updateId) {
      // Fetch participant data to get their event slug
      fetch(`/api/participants/get?id=${updateId}`)
        .then(response => {
          if (response.ok) {
            return response.json()
          }
          throw new Error('Participant not found')
        })
        .then(data => {
          const participant = data.participant
          if (participant?.eventSlug) {
            // Redirect to the correct event page with update mode
            router.replace(`/eventos/${participant.eventSlug}?update=${updateId}`)
          } else {
            console.error('Participant has no event slug')
            setLoading(false)
          }
        })
        .catch(error => {
          console.error('Failed to load participant for update:', error)
          setLoading(false)
        })
      return
    }

    // Load active events for display
    loadActiveEvents()
  }, [searchParams, router])

  const loadActiveEvents = async () => {
    try {
      const response = await fetch('/api/public/eventos')
      if (response.ok) {
        const data = await response.json()
        // Filter only active events
        const active = (data.events || []).filter((e: EventSummary) => e.status === 'active')
        setActiveEvents(active)
      }
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

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
          {/* Header */}
          <div className="text-center py-8">
            <div className="mb-6">
              <MegaFeiraLogo className="text-5xl" showTagline />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              Bem-vindo ao Sistema de Cadastro
            </h1>
            <p className="text-sm text-white/80 mb-4">
              Sua experiência em feiras e eventos começa aqui.
            </p>
          </div>

          {/* Info Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-6 mb-6 border border-white/20">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">🎫</div>
              <h2 className="text-lg font-semibold text-white mb-2">
                Como se cadastrar?
              </h2>
            </div>
            <p className="text-sm text-white/80 text-center mb-4">
              Para se cadastrar em um evento, você precisa do <strong className="text-verde-agua">link exclusivo</strong> fornecido pelo organizador.
            </p>
            <div className="bg-white/10 rounded-lg p-4 text-center">
              <p className="text-xs text-white/70 mb-2">Exemplo de link:</p>
              <code className="text-verde-agua text-sm font-mono">
                app.megafeira.com/eventos/nome-do-evento
              </code>
            </div>
          </div>

          {/* Active Events (if any) */}
          {!loading && activeEvents.length > 0 && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-6 mb-6 border border-white/20">
              <h2 className="text-lg font-semibold text-white mb-4 text-center">
                📅 Eventos Ativos
              </h2>
              <div className="space-y-3">
                {activeEvents.map((event) => (
                  <a
                    key={event.slug}
                    href={`/eventos/${event.slug}`}
                    className="block bg-white/10 hover:bg-white/20 rounded-lg p-4 transition-colors border border-white/10 hover:border-verde-agua/50"
                  >
                    <h3 className="font-semibold text-white mb-1">{event.name}</h3>
                    <div className="flex justify-between items-center text-xs text-white/70">
                      <span>
                        {formatEventDate(event.startDate)} - {formatEventDate(event.endDate)}
                      </span>
                      <span className="text-verde-agua">
                        {event.currentCount}/{event.maxCapacity} vagas
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-sm p-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-4 text-center">
              ✨ Por que usar nosso sistema?
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-verde-agua text-xl">✓</span>
                <div>
                  <h3 className="text-white font-medium text-sm">Entrada Ágil</h3>
                  <p className="text-white/70 text-xs">Reconhecimento facial para acesso rápido, sem filas</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-verde-agua text-xl">✓</span>
                <div>
                  <h3 className="text-white font-medium text-sm">Segurança LGPD</h3>
                  <p className="text-white/70 text-xs">Seus dados protegidos e criptografados</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-verde-agua text-xl">✓</span>
                <div>
                  <h3 className="text-white font-medium text-sm">100% Mobile</h3>
                  <p className="text-white/70 text-xs">Funciona direto no navegador do celular</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-white/50">
              Sistema de Cadastramento Facial para Eventos
            </p>
            <p className="text-xs text-white/40 mt-1">
              © {new Date().getFullYear()} Mega Feira
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  )
}
