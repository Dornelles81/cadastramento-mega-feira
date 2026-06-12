'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Auditoria (SPEC acesso-por-stand seção 2.5): visualização de audit_logs
 * com filtros por stand, ação e período, e exportação CSV.
 */

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  actorType?: string | null
  actorIdentifier?: string | null
  adminUser?: string
  adminName?: string
  adminIp?: string
  targetParticipantId?: string | null
  targetSnapshot?: { name?: string; document?: string; registeredAt?: string } | null
  reason?: string | null
  userAgent?: string | null
  description?: string
  severity: string
  metadata?: any
  previousData?: any
  newData?: any
  changes?: any
  createdAt: string
  event?: { name: string; code: string; slug: string } | null
  stand?: { name: string; code: string } | null
}

interface StandOption {
  id: string
  name: string
  code: string
}

interface SubstitutionRow {
  standId: string
  stand?: { name: string; code: string } | null
  event?: { name: string; slug: string } | null
  totalRemovals: number
  removalsDuringEvent: number
  withCheckinToday: number
  quota?: { used: number; limit: number } | null
}

const ACTION_LABELS: Record<string, string> = {
  TOKEN_GENERATED: '🔗 Link gerado',
  TOKEN_REVOKED: '🔒 Link revogado',
  PANEL_ACCESS: '👁️ Acesso ao painel',
  PARTICIPANT_REMOVED: '🗑️ Credenciado excluído',
  LGPD_PURGE: '🧹 Expurgo LGPD',
  UPLOAD_PURGE_FAILED: '⚠️ Falha em arquivo',
  CREATE: '➕ Criação',
  UPDATE: '✏️ Edição',
  DELETE: '🗑️ Exclusão'
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] || `📝 ${action}`
}

function actionColor(action: string) {
  if (action === 'PARTICIPANT_REMOVED' || action === 'DELETE') return 'bg-red-100 text-red-800'
  if (action === 'TOKEN_GENERATED') return 'bg-teal-100 text-teal-800'
  if (action === 'TOKEN_REVOKED') return 'bg-orange-100 text-orange-800'
  if (action === 'PANEL_ACCESS') return 'bg-blue-100 text-blue-800'
  if (action === 'LGPD_PURGE') return 'bg-purple-100 text-purple-800'
  if (action === 'UPLOAD_PURGE_FAILED') return 'bg-yellow-100 text-yellow-800'
  if (action === 'CREATE') return 'bg-green-100 text-green-800'
  return 'bg-gray-100 text-gray-800'
}

const PAGE_SIZE = 100

export default function AuditLogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [stands, setStands] = useState<StandOption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Fase 7: visão "Trocas por stand"
  const [reportMode, setReportMode] = useState(false)
  const [report, setReport] = useState<SubstitutionRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)

  // Filtros (SPEC: stand, ação e período)
  const [actionFilter, setActionFilter] = useState('all')
  const [standFilter, setStandFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (standFilter) params.set('standId', standFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      for (const [k, v] of Object.entries(extra)) params.set(k, v)
      return params.toString()
    },
    [actionFilter, standFilter, fromDate, toDate]
  )

  const loadLogs = useCallback(async (targetPage: number) => {
    try {
      setLoading(true)
      const qs = buildQuery({ page: String(targetPage), limit: String(PAGE_SIZE) })
      const response = await fetch(`/api/admin/audit-logs?${qs}`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setTotal(data.total || 0)
        setActions(data.actions || [])
        setPage(targetPage)
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    loadLogs(1)
    if (reportMode) loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, standFilter, fromDate, toDate])

  useEffect(() => {
    fetch('/api/admin/stands')
      .then((r) => (r.ok ? r.json() : { stands: [] }))
      .then((d) => setStands((d.stands || []).map((s: any) => ({ id: s.id, name: s.name, code: s.code }))))
      .catch(() => setStands([]))
  }, [])

  const exportCsv = () => {
    window.location.href = `/api/admin/audit-logs?${buildQuery({ format: 'csv' })}`
  }

  const loadReport = async () => {
    try {
      setReportLoading(true)
      const qs = buildQuery({ report: 'substitutions' })
      const response = await fetch(`/api/admin/audit-logs?${qs}`)
      if (response.ok) {
        const data = await response.json()
        setReport(data.report || [])
      }
    } catch (error) {
      console.error('Failed to load report:', error)
    } finally {
      setReportLoading(false)
    }
  }

  const toggleReport = () => {
    const next = !reportMode
    setReportMode(next)
    if (next) loadReport()
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">📋 Auditoria</h1>
              <p className="text-gray-600">
                Trilha imutável de ações: links de stand, exclusões, expurgos e operações administrativas
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/admin')}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                ← Voltar
              </button>
              <button
                onClick={toggleReport}
                className={`px-4 py-2 rounded-lg text-white ${reportMode ? 'bg-gray-600 hover:bg-gray-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {reportMode ? '← Voltar aos logs' : '🔁 Trocas por stand'}
              </button>
              {!reportMode && (
                <>
                  <button
                    onClick={exportCsv}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    title="Exporta com os filtros atuais aplicados"
                  >
                    📥 Exportar CSV
                  </button>
                  <button
                    onClick={() => loadLogs(page)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    disabled={loading}
                  >
                    🔄 Atualizar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Filtros: stand, ação e período (SPEC 2.5) */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">📌 Ação</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">Todas as ações</option>
                {actions.map((a) => (
                  <option key={a} value={a}>{actionLabel(a).replace(/^\S+\s/, '')} ({a})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🏪 Stand</label>
              <select
                value={standFilter}
                onChange={(e) => setStandFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todos os stands</option>
                {stands.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">📅 De</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">📅 Até</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Fase 7: visão Trocas por stand (anti-rotatividade) */}
        {reportMode && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
            <div className="p-6 pb-2">
              <h2 className="text-lg font-bold text-gray-800">🔁 Trocas por stand</h2>
              <p className="text-sm text-gray-500">
                Exclusões de credenciados por stand (respeitando os filtros de stand e período).
                Stands no topo são os candidatos a conversa com o promotor.
              </p>
            </div>
            {reportLoading ? (
              <p className="p-6 text-gray-500">🔄 Carregando...</p>
            ) : report.length === 0 ? (
              <p className="p-6 text-gray-500">Nenhuma troca registrada para os filtros selecionados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Stand</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Evento</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Exclusões</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Durante o evento</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Com check-in no dia</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Cota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {report.map((row) => (
                      <tr key={row.standId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-gray-900">{row.stand?.name || row.standId}</p>
                          {row.stand?.code && <p className="text-xs text-gray-500 font-mono">{row.stand.code}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.event?.name || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{row.totalRemovals}</td>
                        <td className="px-4 py-3 text-right">{row.removalsDuringEvent}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.withCheckinToday > 0 ? 'text-amber-700 font-semibold' : ''}>
                            {row.withCheckinToday}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {row.quota ? `${row.quota.used} de ${row.quota.limit}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Resumo + paginação */}
        {!reportMode && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-center justify-between flex-wrap gap-2">
          <p className="text-gray-600">
            <strong>{total}</strong> registro{total !== 1 ? 's' : ''}
            {loading && <span className="ml-2 text-blue-500">🔄 Carregando...</span>}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(page - 1)}
                disabled={page <= 1 || loading}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-40"
              >
                ←
              </button>
              <span className="text-sm text-gray-600">página {page} de {totalPages}</span>
              <button
                onClick={() => loadLogs(page + 1)}
                disabled={page >= totalPages || loading}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </div>
        )}

        {/* Tabela */}
        {!reportMode && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700">Ação</th>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700">Stand / Evento</th>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700">Ator</th>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700">Alvo</th>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700">Data/Hora</th>
                  <th className="text-left px-4 py-4 font-semibold text-gray-700"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                        {actionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {log.stand ? (
                        <p className="text-gray-900">{log.stand.name}</p>
                      ) : (
                        <p className="text-gray-400">—</p>
                      )}
                      {log.event && <p className="text-xs text-gray-500">{log.event.name}</p>}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <p className="text-gray-900">{log.actorIdentifier || log.adminUser || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {log.actorType === 'stand_responsible' ? 'responsável do stand' : log.actorType || (log.adminUser ? 'admin' : '')}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {log.targetSnapshot?.name
                        ? `${log.targetSnapshot.name} (${log.targetSnapshot.document ?? ''})`
                        : log.description || '—'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && logs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-gray-500">Nenhum registro para os filtros selecionados</p>
            </div>
          )}
        </div>
        )}

        {/* Modal de detalhes */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Detalhes do registro</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Ação:</span><br />
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${actionColor(selectedLog.action)}`}>
                      {actionLabel(selectedLog.action)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Data/Hora:</span><br />
                    {new Date(selectedLog.createdAt).toLocaleString('pt-BR')}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Stand:</span><br />
                    {selectedLog.stand ? `${selectedLog.stand.name} (${selectedLog.stand.code})` : '—'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Evento:</span><br />
                    {selectedLog.event?.name || '—'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Ator:</span><br />
                    {selectedLog.actorIdentifier || selectedLog.adminUser || '—'}
                    {selectedLog.actorType && (
                      <span className="text-xs text-gray-500"> ({selectedLog.actorType})</span>
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">IP:</span><br />
                    <span className="font-mono text-xs">{selectedLog.adminIp || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-gray-600">Descrição:</span><br />
                    {selectedLog.description || '—'}
                  </div>
                </div>

                {selectedLog.targetSnapshot && (
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-semibold text-red-800 mb-2">Credenciado afetado (snapshot)</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Nome:</span><br />
                        {selectedLog.targetSnapshot.name || '—'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Documento:</span><br />
                        {selectedLog.targetSnapshot.document || '—'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Cadastrado em:</span><br />
                        {selectedLog.targetSnapshot.registeredAt
                          ? new Date(selectedLog.targetSnapshot.registeredAt).toLocaleString('pt-BR')
                          : '—'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Motivo informado:</span><br />
                        {selectedLog.reason || '—'}
                      </div>
                    </div>
                  </div>
                )}

                {selectedLog.userAgent && (
                  <p className="text-xs text-gray-400 break-all">
                    <span className="font-medium">User-agent:</span> {selectedLog.userAgent}
                  </p>
                )}

                {selectedLog.metadata && (
                  <details className="bg-gray-50 rounded-lg p-4">
                    <summary className="font-semibold text-gray-800 cursor-pointer">Metadata (JSON)</summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </details>
                )}

                {selectedLog.previousData && (
                  <details className="bg-gray-50 rounded-lg p-4">
                    <summary className="font-semibold text-gray-800 cursor-pointer">Dados anteriores (JSON)</summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.previousData, null, 2)}
                    </pre>
                  </details>
                )}
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
