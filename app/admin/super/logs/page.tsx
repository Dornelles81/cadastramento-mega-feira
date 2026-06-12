'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId?: string
  adminEmail?: string
  description?: string
  severity: string
  createdAt: string
  event?: {
    name: string
    code: string
  }
}

export default function LogsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }

    if (status === 'authenticated') {
      if (session?.user?.role !== 'SUPER_ADMIN') {
        router.push('/admin/dashboard')
        return
      }
      loadLogs()
    }
  }, [status, session])

  const loadLogs = async () => {
    try {
      const response = await fetch('/api/admin/logs')
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

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Carregando logs...</p>
        </div>
      </div>
    )
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    return log.severity === filter
  })

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800'
      case 'ERROR': return 'bg-orange-100 text-orange-800'
      case 'WARNING': return 'bg-yellow-100 text-yellow-800'
      case 'INFO': return 'bg-blue-100 text-blue-800'
      case 'DEBUG': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN')) return '🔐'
    if (action.includes('CREATE')) return '➕'
    if (action.includes('UPDATE')) return '✏️'
    if (action.includes('DELETE')) return '🗑️'
    if (action.includes('VIEW')) return '👁️'
    if (action.includes('EXPORT')) return '📊'
    if (action.includes('APPROVE')) return '✅'
    if (action.includes('REJECT')) return '❌'
    return '📝'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                📋 Logs de Auditoria Global
              </h1>
              <p className="text-sm text-gray-600">
                Histórico completo de todas as ações no sistema
              </p>
            </div>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              onClick={() => setFilter('CRITICAL')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'CRITICAL'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Crítico ({logs.filter(l => l.severity === 'CRITICAL').length})
            </button>
            <button
              onClick={() => setFilter('ERROR')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'ERROR'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Erro ({logs.filter(l => l.severity === 'ERROR').length})
            </button>
            <button
              onClick={() => setFilter('WARNING')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'WARNING'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alerta ({logs.filter(l => l.severity === 'WARNING').length})
            </button>
            <button
              onClick={() => setFilter('INFO')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'INFO'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Info ({logs.filter(l => l.severity === 'INFO').length})
            </button>
          </div>
        </div>

        {/* Logs List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-200">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📭</div>
                <p className="text-gray-500">Nenhum log encontrado</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="text-2xl">{getActionIcon(log.action)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(log.severity)}`}>
                          {log.severity}
                        </span>
                        <span className="text-xs font-medium text-gray-500">
                          {log.action}
                        </span>
                        {log.event && (
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                            {log.event.code}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-800 mb-1">
                        {log.description || `${log.action} em ${log.entityType}`}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {log.adminEmail && (
                          <span>👤 {log.adminEmail}</span>
                        )}
                        <span>🕐 {new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                        {log.entityId && (
                          <span className="font-mono">ID: {log.entityId.substring(0, 8)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
