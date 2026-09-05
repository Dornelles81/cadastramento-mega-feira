'use client'

import { useState } from 'react'

type Status = 'pending' | 'approved' | 'rejected'

/**
 * APROVAR no painel do gestor. Só isso.
 *
 * Só aparece quando o evento habilitou a delegação (`standApprovalEnabled`);
 * quem decide isso é o servidor, esta peça só desenha.
 *
 * ── POR QUE SÓ APROVAR (04/09/2026) ───────────────────────────────────────
 * O painel do gestor foi reduzido a duas ações: Aprovar e Retirar da equipe.
 * Motivo medido, não estético: em 466 aprovações do Expofest, NENHUM gestor de
 * stand rejeitou alguém. As 16 rejeições do histórico saíram de contas da
 * organização e de testes. E "rejeitar mas continuar ocupando a vaga" exigia um
 * modal para ser entendido — quando um conceito precisa de parágrafo na
 * confirmação, ele não cabe naquela tela.
 *
 * O binário que sobrou também é coerente com a vaga: Aprovar libera acesso,
 * Retirar libera vaga. Nenhuma ação deixa a pessoa num terceiro estado que
 * ocupa espaço sem servir para nada.
 *
 * Rejeitar continua existindo no painel da organização, operado por quem
 * distingue "não aprovado" de "não cadastrado".
 *
 * Dois cuidados que continuam aqui de propósito:
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
  const [enviando, setEnviando] = useState<'approve' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (acao: 'approve', confirmaFotoNaoValidada = false) => {
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

  const ocupado = enviando !== null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {/* Só APROVAR. O botão de rejeitar saiu em 04/09/2026: em 466 aprovações
            nenhum gestor de stand rejeitou ninguém, e "rejeitar mas continuar
            ocupando a vaga" precisava de um modal para ser entendido — sinal de
            que o conceito não cabia nesta tela. Rejeitar segue existindo no
            painel da organização.

            Quem está `rejected` NÃO ganha botão de aprovar: a recusa é decisão
            da organização, por um motivo que o gestor não conhece, e um clique
            aqui a desfaria sem ele saber que houve recusa. O painel continua
            mostrando o estado em vermelho, e /api/stand-approval recusa a
            aprovação com a mesma régua — esta ausência é conveniência, a trava
            está no servidor. */}
        {status !== 'approved' && status !== 'rejected' && (
          <button
            type="button"
            onClick={aprovar}
            disabled={ocupado}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {enviando === 'approve' ? 'Aprovando...' : 'Aprovar'}
          </button>
        )}
        {status === 'rejected' && (
          <span className="text-xs text-red-700">Falar com a organização</span>
        )}
      </div>
      {erro && <p className="text-xs text-red-600 max-w-[16rem] text-right">{erro}</p>}
    </div>
  )
}
