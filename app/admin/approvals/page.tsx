'use client'

import { useState, useEffect } from 'react'

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
  }
}

export default function ApprovalsPage() {
  const [logs, setLogs] = useState<ApprovalLog[]>([])
  const [loading, setLoading] = useState(false)
  const [isPasswordValid, setIsPasswordValid] = useState(false)
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')

  // Check for saved password
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPassword = sessionStorage.getItem('adminPassword')
      if (savedPassword === 'admin123') {
        setIsPasswordValid(true)
        loadLogs()
      }
    }
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/approval-logs', {
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

  if (!isPasswordValid) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p>Redirecionando para login...</p>
          <a href="/admin" className="text-blue-600 hover:underline">
            Clique aqui se não for redirecionado
          </a>
        </div>
      </div>
    )
  }

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.action === filter)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              ✅ Central de Aprovações
            </h1>
            <div className="flex gap-3">
              <a
                href="/admin"
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                ← Voltar
              </a>
              <button
                onClick={loadLogs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={loading}
              >
                🔄 Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📋 Todos ({logs.length})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === 'approved' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ✅ Aprovados ({logs.filter(l => l.action === 'approved').length})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === 'rejected' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ❌ Rejeitados ({logs.filter(l => l.action === 'rejected').length})
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Data/Hora</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Participante</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">CPF</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Ação</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Motivo</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Admin</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {log.participant.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono">
                      {log.participant.cpf}
                    </td>
                    <td className="px-6 py-4">
                      {log.action === 'approved' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✅ Aprovado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ❌ Rejeitado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {log.reason || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {log.adminUser}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs font-mono">
                      {log.adminIp || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-500">
                {loading ? 'Carregando logs...' : 'Nenhum log encontrado'}
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-green-50 rounded-lg p-6">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-2xl font-bold text-green-800">
              {logs.filter(l => l.action === 'approved').length}
            </div>
            <div className="text-green-600">Participantes Aprovados</div>
          </div>

          <div className="bg-red-50 rounded-lg p-6">
            <div className="text-3xl mb-2">❌</div>
            <div className="text-2xl font-bold text-red-800">
              {logs.filter(l => l.action === 'rejected').length}
            </div>
            <div className="text-red-600">Participantes Rejeitados</div>
          </div>

          <div className="bg-blue-50 rounded-lg p-6">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-2xl font-bold text-blue-800">
              {logs.length}
            </div>
            <div className="text-blue-600">Total de Ações</div>
          </div>
        </div>
      </div>
    </div>
  )
}