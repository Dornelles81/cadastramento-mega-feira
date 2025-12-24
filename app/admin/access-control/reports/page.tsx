'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import MegaFeiraLogo from '../../../../components/MegaFeiraLogo'

interface AccessLog {
  id: string
  type: string
  time: string
  gate?: string
  operator?: { name?: string }
  participant: {
    id: string
    name: string
    cpf: string
    stand?: string
  }
}

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

function ReportsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventSlug = searchParams.get('event')

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [logs, setLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [filter, setFilter] = useState<'all' | 'ENTRY' | 'EXIT'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [summary, setSummary] = useState({ entries: 0, exits: 0 })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }
  }, [status, router])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDarkMode(localStorage.getItem('adminDarkMode') === 'true')
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      loadEvents()
    }
  }, [status])

  useEffect(() => {
    if (selectedEvent) {
      loadLogs()
    }
  }, [selectedEvent, filter, dateFrom, dateTo])

  const loadEvents = async () => {
    try {
      // Use admin API to get all events (not just public/active)
      const response = await fetch('/api/admin/eventos')
      if (response.ok) {
        const data = await response.json()
        const eventsList = data.events || []

        // Map to include id, name, code, slug
        const mappedEvents = eventsList.map((e: any) => ({
          id: e.id,
          name: e.name,
          code: e.code,
          slug: e.slug
        }))

        setEvents(mappedEvents)

        if (eventSlug) {
          const event = mappedEvents.find((e: Event) => e.slug === eventSlug)
          if (event) setSelectedEvent(event)
        }
      }
    } catch (error) {
      console.error('Failed to load events:', error)
    }
  }

  const loadLogs = async () => {
    if (!selectedEvent) return

    setLoading(true)
    try {
      let url = `/api/access/logs?eventId=${selectedEvent.id}&limit=500`
      if (filter !== 'all') {
        url += `&type=${filter}`
      }
      if (dateFrom) {
        url += `&from=${dateFrom}T00:00:00`
      }
      if (dateTo) {
        url += `&to=${dateTo}T23:59:59`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setTotalCount(data.total || 0)
        setSummary(data.summary || { entries: 0, exits: 0 })
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    if (!selectedEvent) return

    let url = `/api/access/logs?eventId=${selectedEvent.id}&format=csv&limit=10000`
    if (filter !== 'all') {
      url += `&type=${filter}`
    }
    if (dateFrom) {
      url += `&from=${dateFrom}T00:00:00`
    }
    if (dateTo) {
      url += `&to=${dateTo}T23:59:59`
    }

    window.open(url, '_blank')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return null
  }

  return (
    <div className={`min-h-screen p-4 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`rounded-lg shadow-lg p-4 mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <MegaFeiraLogo className="text-2xl" darkMode={darkMode} />
              <div>
                <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  📊 Relatorios de Acesso
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Historico de entradas e saidas
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/admin/access-control')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                🚪 Controle de Acesso
              </button>
              <button
                onClick={() => router.back()}
                className={`px-4 py-2 rounded-lg ${
                  darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                ← Voltar
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-lg shadow-sm p-4 mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select
              value={selectedEvent?.id || ''}
              onChange={(e) => {
                const event = events.find(ev => ev.id === e.target.value)
                setSelectedEvent(event || null)
              }}
              className={`px-3 py-2 rounded-lg ${
                darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              <option value="">Selecione o evento</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className={`px-3 py-2 rounded-lg ${
                darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              <option value="all">Todos</option>
              <option value="ENTRY">Entradas</option>
              <option value="EXIT">Saidas</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`px-3 py-2 rounded-lg ${
                darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
              }`}
              placeholder="Data inicial"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`px-3 py-2 rounded-lg ${
                darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
              }`}
              placeholder="Data final"
            />

            <button
              onClick={exportCSV}
              disabled={!selectedEvent}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              📥 Exportar CSV
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className={`rounded-lg p-4 text-center ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              {totalCount}
            </div>
            <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Total de registros
            </div>
          </div>
          <div className={`rounded-lg p-4 text-center ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
            <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
              {summary.entries}
            </div>
            <div className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
              Entradas
            </div>
          </div>
          <div className={`rounded-lg p-4 text-center ${darkMode ? 'bg-orange-900/30' : 'bg-orange-50'}`}>
            <div className={`text-2xl font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
              {summary.exits}
            </div>
            <div className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
              Saidas
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className={`rounded-lg shadow-sm overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          {loading ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 animate-pulse">⏳</div>
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Carregando...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                  <tr>
                    <th className={`text-left px-4 py-3 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Data/Hora
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Tipo
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Participante
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      CPF
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Stand
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Portao
                    </th>
                    <th className={`text-left px-4 py-3 text-sm font-semibold hidden xl:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Operador
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {logs.map(log => (
                    <tr key={log.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {new Date(log.time).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          log.type === 'ENTRY'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {log.type === 'ENTRY' ? '➡️ Entrada' : '⬅️ Saida'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {log.participant.name}
                      </td>
                      <td className={`px-4 py-3 font-mono text-sm hidden md:table-cell ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {log.participant.cpf}
                      </td>
                      <td className={`px-4 py-3 text-sm hidden lg:table-cell ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {log.participant.stand || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm hidden lg:table-cell ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {log.gate || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm hidden xl:table-cell ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {log.operator?.name || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                {selectedEvent ? 'Nenhum registro encontrado' : 'Selecione um evento'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    }>
      <ReportsContent />
    </Suspense>
  )
}
