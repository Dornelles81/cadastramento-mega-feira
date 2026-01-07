'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import MegaFeiraLogo from '../../../../../components/MegaFeiraLogo'

interface ApprovalLog {
  id: string
  participantId: string
  action: string
  previousStatus: string
  newStatus: string
  reason?: string
  notes?: string
  adminUser: string
  adminIp?: string
  createdAt: string
  participant: {
    name: string
    cpf: string
    email?: string
    eventCode?: string
    eventId?: string
    event?: {
      name: string
      code: string
      slug: string
    }
  }
}

interface Event {
  id: string
  name: string
  code: string
  slug: string
}

export default function EventApprovalsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const eventSlug = params?.slug as string

  const [event, setEvent] = useState<Event | null>(null)
  const [logs, setLogs] = useState<ApprovalLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')
  const [darkMode, setDarkMode] = useState(false)

  // Check authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }
  }, [status, router])

  // Load dark mode preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('adminDarkMode')
      setDarkMode(savedDarkMode === 'true')
    }
  }, [])

  // Load event info
  useEffect(() => {
    if (status === 'authenticated' && eventSlug) {
      loadEvent()
    }
  }, [status, eventSlug])

  // Load logs when event is loaded
  useEffect(() => {
    if (event) {
      loadLogs()
    }
  }, [event])

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/admin/eventos/${eventSlug}`)
      if (response.ok) {
        const data = await response.json()
        setEvent({
          id: data.event.id,
          name: data.event.name,
          code: data.event.code,
          slug: data.event.slug
        })
      }
    } catch (error) {
      console.error('Error loading event:', error)
    }
  }

  const loadLogs = async () => {
    if (!event) return

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/approval-logs?eventId=${event.id}`, {
        headers: {
          'Authorization': 'Bearer admin-token-mega-feira-2025'
        }
      })
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Error loading logs:', error)
    } finally {
      setLoading(false)
    }
  }

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Verificando autenticacao...</p>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated
  if (status !== 'authenticated') {
    return null
  }

  // Show loading while event is loading
  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="text-gray-600">Carregando evento...</p>
        </div>
      </div>
    )
  }

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.action === filter)

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminDarkMode', String(newDarkMode))
    }
  }

  return (
    <div className={`min-h-screen p-4 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className={`rounded-lg shadow-lg p-6 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <MegaFeiraLogo className="text-2xl" darkMode={darkMode} />
              <div>
                <h1 className={`text-2xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  ✅ Central de Aprovacoes
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {event.name} - Historico de aprovacoes e rejeicoes
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadLogs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={loading}
              >
                {loading ? '⏳' : '🔄'} Atualizar
              </button>
              <button
                onClick={toggleDarkMode}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <button
                onClick={() => router.push(`/admin/eventos/${eventSlug}`)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                ← Voltar ao Evento
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`rounded-lg p-6 ${darkMode ? 'bg-green-900/30 border border-green-700' : 'bg-green-50'}`}>
            <div className="text-3xl mb-2">✅</div>
            <div className={`text-3xl font-bold ${darkMode ? 'text-green-400' : 'text-green-800'}`}>
              {logs.filter(l => l.action === 'approved').length}
            </div>
            <div className={darkMode ? 'text-green-300' : 'text-green-600'}>Aprovados</div>
          </div>

          <div className={`rounded-lg p-6 ${darkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-50'}`}>
            <div className="text-3xl mb-2">❌</div>
            <div className={`text-3xl font-bold ${darkMode ? 'text-red-400' : 'text-red-800'}`}>
              {logs.filter(l => l.action === 'rejected').length}
            </div>
            <div className={darkMode ? 'text-red-300' : 'text-red-600'}>Rejeitados</div>
          </div>

          <div className={`rounded-lg p-6 ${darkMode ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50'}`}>
            <div className="text-3xl mb-2">📊</div>
            <div className={`text-3xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
              {logs.length}
            </div>
            <div className={darkMode ? 'text-blue-300' : 'text-blue-600'}>Total de Acoes</div>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-lg shadow-sm p-4 mb-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📋 Todos ({logs.length})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'approved'
                  ? 'bg-green-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ✅ Aprovados ({logs.filter(l => l.action === 'approved').length})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'rejected'
                  ? 'bg-red-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ❌ Rejeitados ({logs.filter(l => l.action === 'rejected').length})
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className={`rounded-lg shadow-sm overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={`text-left px-4 py-3 font-semibold text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Data/Hora</th>
                  <th className={`text-left px-4 py-3 font-semibold text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Participante</th>
                  <th className={`text-left px-4 py-3 font-semibold text-sm hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>CPF</th>
                  <th className={`text-left px-4 py-3 font-semibold text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Acao</th>
                  <th className={`text-left px-4 py-3 font-semibold text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Motivo</th>
                  <th className={`text-left px-4 py-3 font-semibold text-sm hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Admin</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className={`px-4 py-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="font-medium">{log.participant?.name || 'N/A'}</div>
                    </td>
                    <td className={`px-4 py-3 font-mono text-sm hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {log.participant?.cpf || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      {log.action === 'approved' || log.newStatus === 'approved' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✅ Aprovado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ❌ Rejeitado
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm hidden lg:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {log.reason || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm hidden md:table-cell ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {log.adminUser || 'admin'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                {loading ? 'Carregando logs...' : 'Nenhum log de aprovacao encontrado para este evento'}
              </p>
              <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Os logs sao gerados quando participantes sao aprovados ou rejeitados na pagina do evento
              </p>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className={`rounded-lg p-4 mt-6 ${darkMode ? 'bg-blue-900/20 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
          <h3 className={`font-semibold mb-2 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
            ℹ️ Como funciona?
          </h3>
          <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>
            Esta pagina mostra o historico de aprovacoes e rejeicoes de participantes do evento <strong>{event.name}</strong>.
            Para aprovar ou rejeitar participantes, volte para a pagina de gerenciamento do evento
            e use os botoes "Aprovar" ou "Rejeitar" em cada participante.
          </p>
        </div>
      </div>
    </div>
  )
}
