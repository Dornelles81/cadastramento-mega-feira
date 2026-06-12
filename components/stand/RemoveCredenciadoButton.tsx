'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Exclusão de credenciado pelo responsável (SPEC seção 2.4): modal de
 * confirmação com motivo opcional. A vaga é liberada na hora e a remoção
 * gera registro de auditoria imutável no servidor.
 */
export default function RemoveCredenciadoButton({
  token,
  participantId,
  participantName
}: {
  token: string
  participantId: string
  participantName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleRemove = async () => {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/stand-removal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, participantId, reason: reason.trim() || null })
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(data.message || 'Erro ao excluir credenciado')
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(''); setReason('') }}
        className="text-red-600 hover:text-red-800 text-xs font-medium whitespace-nowrap"
      >
        Excluir
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir credenciado</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remover <strong>{participantName}</strong> do stand? A vaga será liberada e os
              dados biométricos serão apagados. Esta ação fica registrada na auditoria e não
              pode ser desfeita.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 mb-3"
              placeholder="Ex.: substituição de membro da equipe"
            />
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemove}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
