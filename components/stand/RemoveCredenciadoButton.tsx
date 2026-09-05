'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * RETIRAR DA EQUIPE — a única ação destrutiva que sobrou no painel do gestor.
 *
 * Renomeada em 04/09/2026. Chamava-se "Excluir", e o painel da organização usa
 * a MESMA palavra para uma operação diferente: lá é hard delete, que apaga o
 * cadastro inteiro junto com o histórico de aprovações e os registros de
 * entrada e saída. Aqui é soft-remove: a pessoa sai da lista, a vaga volta, a
 * biometria e os documentos são apagados (LGPD), e o cadastro continua
 * registrado. Duas coisas diferentes com o mesmo rótulo é como alguém apaga
 * histórico achando que só tirou uma pessoa da equipe.
 *
 * O texto agora diz o que ACONTECE DEPOIS, que é o que faltava: a pessoa pode
 * se cadastrar de novo pelo link do stand. Até 04/09 isso era mentira — a linha
 * removida bloqueava o recadastro, e foi o que prendeu 9 pessoas no Expofest.
 * Com a raiz corrigida, virou o caminho normal de volta, e o gestor precisa
 * saber disso na hora de decidir.
 *
 * ⚠️ ESTE TEXTO DEPENDE DA CORREÇÃO DA RAIZ (commit d0e133e, 04/09/2026), que
 * fez a linha `removed` deixar de bloquear o recadastro em
 * lib/participants/registrar.ts.
 *
 * SÃO DOIS COMMITS ACOPLADOS. Revertendo a raiz sem reverter este, o modal passa
 * a instruir o gestor a mandar a pessoa se cadastrar de novo — e ela toma 409 de
 * CPF duplicado, que é exatamente o beco sem saída que a correção fechou. Só que
 * agora com a organização tendo PROMETIDO que funciona. Quem reverter um precisa
 * reverter o outro, ou no mínimo trocar este texto de volta para não prometer o
 * que o servidor recusa.
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
        setError(data.message || 'Não foi possível retirar da equipe')
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
        Retirar da equipe
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(''); setReason('') }}
        className="text-red-600 hover:text-red-800 text-xs font-medium whitespace-nowrap"
      >
        Retirar da equipe
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Retirar da equipe</h3>
            <p className="text-sm text-gray-600 mb-3">
              Retirar <strong>{participantName}</strong> da equipe do stand?
            </p>
            <ul className="text-sm text-gray-600 mb-3 list-disc pl-5 space-y-1">
              <li>A <strong>vaga é liberada</strong> para outra pessoa.</li>
              <li>A <strong>foto é apagada</strong> e não tem como recuperar.</li>
              <li>
                Se precisar voltar, a pessoa <strong>se cadastra de novo pelo link de
                cadastro do stand</strong>, com uma foto nova — e precisa ser aprovada
                outra vez.
              </li>
            </ul>
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
                {submitting ? 'Retirando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
