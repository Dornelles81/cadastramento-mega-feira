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
  participantName,
  hasCheckinToday = false,
  nextResetLabel,
  quotaExhausted = false
}: {
  token: string
  participantId: string
  participantName: string
  /** Fase 7: check-in no dia operacional corrente trava a vaga até a virada */
  hasCheckinToday?: boolean
  /** Próxima virada formatada (ex.: "4h de 13/06/2026") */
  nextResetLabel?: string
  /** Cota de substituições esgotada: trocas só via organização */
  quotaExhausted?: boolean
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
        if (data.slotLockedUntil) alert(data.message)
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

  // Cota esgotada: o painel não executa a troca; orienta a falar com a
  // organização (a exclusão via admin continua sempre possível)
  if (quotaExhausted) {
    return (
      <button
        onClick={() =>
          alert('A cota de substituições do stand foi atingida. Novas trocas devem ser solicitadas à organização do evento.')
        }
        className="text-gray-400 text-xs font-medium whitespace-nowrap cursor-help"
        title="Cota de substituições esgotada"
      >
        Excluir
      </button>
    )
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
            <p className="text-sm text-gray-600 mb-3">
              Remover <strong>{participantName}</strong> do stand? Os dados biométricos serão
              apagados e a ação fica registrada na auditoria — não pode ser desfeita.
            </p>
            {/* Consequência real sobre a vaga (Fase 7) — antes de confirmar */}
            {hasCheckinToday ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                ⚠️ Este participante já acessou o evento hoje. A exclusão será efetivada
                agora, mas a vaga só estará disponível para novo cadastro a partir das{' '}
                <strong>{nextResetLabel}</strong>.
              </p>
            ) : (
              <p className="text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4">
                A vaga ficará disponível imediatamente para novo cadastro.
              </p>
            )}
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
