'use client'

import { useState } from 'react'

/**
 * Botão de reativar, no painel do gestor.
 *
 * Confirma antes, porque reativar OCUPA uma vaga do stand — e a mensagem diz o
 * que reativar não faz: não traz a foto de volta. A remoção apagou a biometria
 * (LGPD), então a pessoa volta à equipe sem acesso ao terminal até tirar foto
 * nova. Esconder isso faria o gestor achar que resolveu, e a falha só
 * apareceria na catraca, no dia.
 */
export default function ReativarCredenciadoButton({
  token,
  participantId,
  participantName
}: {
  token: string
  participantId: string
  participantName: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const reativar = async () => {
    const ok = window.confirm(
      `Trazer ${participantName} de volta para a equipe?\n\n` +
      'Isso ocupa uma vaga do stand.\n\n' +
      'ATENÇÃO: a foto foi apagada na exclusão. A pessoa vai precisar tirar uma ' +
      'foto nova antes de conseguir entrar no evento.'
    )
    if (!ok) return

    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch('/api/stand-reactivation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, participantId })
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(j.message || j.error || 'Não foi possível reativar.')
        return
      }
      // Recarrega: a lista é renderizada no servidor.
      window.location.reload()
    } catch (e: any) {
      setErro(e?.message ?? 'Falha de conexão.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={reativar}
        disabled={enviando}
        className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
      >
        {enviando ? 'Reativando...' : '↩ Trazer de volta'}
      </button>
      {erro && <p className="text-xs text-red-600 max-w-[16rem] text-right">{erro}</p>}
    </div>
  )
}
