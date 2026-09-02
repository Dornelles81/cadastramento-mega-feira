'use client'

import { useState } from 'react'

type Status = 'pending' | 'approved' | 'rejected'

/**
 * Aprovar / rejeitar no painel do gestor.
 *
 * Só aparece quando o evento habilitou a delegação (`standApprovalEnabled`);
 * quem decide isso é o servidor, esta peça só desenha.
 *
 * Três cuidados que estão aqui de propósito:
 *
 *  · REJEITAR NÃO É EXCLUIR. O texto diz isso na confirmação, porque os dois
 *    botões ficam na mesma linha e são coisas muito diferentes: rejeitar tira a
 *    pessoa dos terminais e ela CONTINUA no stand, com a foto intacta, podendo
 *    ser aprovada depois; excluir apaga a biometria e consome cota.
 *
 *  · FOTO NÃO VALIDADA. O servidor responde 428 pedindo confirmação quando a
 *    foto nunca passou pelo detector. Aqui isso vira uma segunda pergunta, com
 *    o motivo em português — e o caminho recomendado (pedir foto nova) vem
 *    ANTES da opção de aprovar assim mesmo.
 *
 *  · O RESULTADO É RECARREGADO do servidor, não pintado otimista: a lista é
 *    renderizada no server e o estado de aprovação muda mais coisas do que este
 *    botão conhece (identidade, fila dos terminais).
 */
export default function AprovarCredenciadoButton({
  token,
  participantId,
  participantName,
  status
}: {
  token: string
  participantId: string
  participantName: string
  status: Status
}) {
  const [enviando, setEnviando] = useState<'approve' | 'reject' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (acao: 'approve' | 'reject', confirmaFotoNaoValidada = false) => {
    setEnviando(acao)
    setErro(null)
    try {
      const r = await fetch('/api/stand-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, participantId, acao, confirmaFotoNaoValidada })
      })
      const j = await r.json().catch(() => ({}))

      // 428: o servidor exige a confirmação da foto não validada.
      if (r.status === 428 && j?.precisaConfirmar === 'foto-nao-validada') {
        const insistir = window.confirm(
          `${j.message}\n\n` +
          'OK = aprovar mesmo assim.\n' +
          'Cancelar = não aprovar agora (recomendado: peça uma foto nova).'
        )
        if (!insistir) return
        await enviar(acao, true)
        return
      }

      if (!r.ok) {
        setErro(j.message || j.error || 'Não foi possível concluir.')
        return
      }
      window.location.reload()
    } catch (e: any) {
      setErro(e?.message ?? 'Falha de conexão.')
    } finally {
      setEnviando(null)
    }
  }

  const aprovar = () => enviar('approve')

  const rejeitar = () => {
    const ok = window.confirm(
      `Rejeitar ${participantName}?\n\n` +
      'A pessoa CONTINUA no stand e ocupando a vaga — rejeitar não é excluir. ' +
      'Ela deixa de valer nos terminais e não entra no evento até ser aprovada.\n\n' +
      'Dá para aprovar depois, a qualquer momento.'
    )
    if (!ok) return
    enviar('reject')
  }

  const ocupado = enviando !== null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {status !== 'approved' && (
          <button
            type="button"
            onClick={aprovar}
            disabled={ocupado}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {enviando === 'approve' ? 'Aprovando...' : 'Aprovar'}
          </button>
        )}
        {status !== 'rejected' && (
          <button
            type="button"
            onClick={rejeitar}
            disabled={ocupado}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {enviando === 'reject' ? 'Rejeitando...' : 'Rejeitar'}
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-red-600 max-w-[16rem] text-right">{erro}</p>}
    </div>
  )
}
