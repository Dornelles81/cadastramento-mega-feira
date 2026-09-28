'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * Links do BALCÃO de recoleta facial do evento.
 *
 * Um link por operador (o nome aparece na auditoria de cada troca). O link em
 * claro aparece UMA vez, ao gerar; depois, só dá para revogar e gerar outro.
 * Revogar vale na próxima ação do operador — não há sessão para expirar.
 * Embaixo, as trocas de foto feitas no balcão, para conferência diária.
 */

interface Link {
  id: string
  label: string
  createdAt: string
  createdByEmail: string | null
  expiresAt: string
  revokedAt: string | null
  revokedBy: string | null
  lastUsedAt: string | null
  ativo: boolean
}
interface Troca { id: string; em: string; descricao: string; operador: string | null }

const dt = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function BalcaoLinksPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [dados, setDados] = useState<{ evento: { name: string; endDate: string }; links: Link[]; trocas: Troca[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [novo, setNovo] = useState<{ label: string; link: string; expiresAt: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/admin/eventos/${slug}/balcao-links`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setDados(j); setErro(null) } else setErro(j.error ?? 'Não foi possível carregar.')
  }, [slug])

  useEffect(() => { if (slug) carregar() }, [slug, carregar])

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    if (label.trim().length < 3 || ocupado) return
    setOcupado(true)
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/balcao-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label })
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { setNovo({ label: j.label, link: j.link, expiresAt: j.expiresAt }); setCopiado(false); setLabel(''); carregar() }
      else setErro(j.error ?? 'Não foi possível gerar.')
    } finally { setOcupado(false) }
  }

  async function revogar(l: Link) {
    if (!confirm(`Revogar o link de "${l.label}"? A pessoa perde o acesso na próxima ação.`)) return
    const r = await fetch(`/api/admin/eventos/${slug}/balcao-links`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id })
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErro(j.error ?? 'Não foi possível revogar.') }
    if (novo && dados?.links.find((x) => x.id === l.id)?.label === novo.label) setNovo(null)
    carregar()
  }

  async function copiar() {
    if (!novo) return
    try { await navigator.clipboard.writeText(novo.link); setCopiado(true) } catch { setCopiado(false) }
  }

  const ativos = dados?.links.filter((l) => l.ativo) ?? []
  const inativos = dados?.links.filter((l) => !l.ativo) ?? []

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <a href={`/admin/eventos/${slug}`} className="text-sm text-teal-700 hover:underline">← Voltar ao evento</a>
            <h1 className="text-2xl font-bold mt-1">Balcão de recoleta facial</h1>
            {dados && <p className="text-sm text-gray-600">{dados.evento.name} · os links expiram no fim do evento ({dt(dados.evento.endDate)})</p>}
          </div>
        </div>

        {erro && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 text-red-900 p-3 text-sm">{erro}</div>}

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold">Gerar link para um operador</h2>
          <p className="text-sm text-gray-600">
            O link só busca pelo CPF ou documento e troca a foto. A aprovação é mantida, e cada troca registra o operador,
            a foto anterior e a nova.
          </p>
          <form onSubmit={gerar} className="flex flex-col sm:flex-row gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Quem vai operar (ex.: Maria — balcão 1)"
              maxLength={80}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 bg-white text-gray-900"
            />
            <button disabled={label.trim().length < 3 || ocupado} className="rounded-lg bg-teal-700 text-white px-4 py-2 font-medium disabled:opacity-50">
              Gerar link
            </button>
          </form>
          {novo && (
            <div className="rounded-lg border border-teal-300 bg-teal-50 p-3 space-y-2">
              <p className="text-sm font-medium text-teal-900">Link de &quot;{novo.label}&quot;, válido até {dt(novo.expiresAt)}</p>
              <div className="flex gap-2">
                <input readOnly value={novo.link} onFocus={(e) => e.currentTarget.select()} className="flex-1 font-mono text-xs rounded border border-gray-300 px-2 py-1.5 bg-white text-gray-900" />
                <button onClick={copiar} className="rounded bg-gray-800 text-white px-3 text-sm">{copiado ? 'Copiado' : 'Copiar'}</button>
              </div>
              <p className="text-xs text-gray-600">Mostrado uma única vez. Envie só para a pessoa que vai operar; quem tiver o link troca fotos.</p>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-3">Links ativos ({ativos.length})</h2>
          {ativos.length === 0 && <p className="text-sm text-gray-600">Nenhum.</p>}
          <ul className="divide-y divide-gray-100">
            {ativos.map((l) => (
              <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                <div className="text-sm min-w-0">
                  <p className="font-medium break-words">{l.label}</p>
                  <p className="text-gray-600">Gerado {dt(l.createdAt)} · último uso {dt(l.lastUsedAt)} · expira {dt(l.expiresAt)}</p>
                </div>
                <button onClick={() => revogar(l)} className="shrink-0 rounded-lg border border-red-300 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50">Revogar</button>
              </li>
            ))}
          </ul>
          {inativos.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-gray-600 cursor-pointer">Revogados ou expirados ({inativos.length})</summary>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {inativos.map((l) => (
                  <li key={l.id}>{l.label} — {l.revokedAt ? `revogado ${dt(l.revokedAt)} por ${l.revokedBy ?? '?'}` : `expirou ${dt(l.expiresAt)}`}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-1">Trocas de foto no balcão ({dados?.trocas.length ?? 0})</h2>
          <p className="text-sm text-gray-600 mb-3">Para conferência diária. Últimas 100.</p>
          {(dados?.trocas.length ?? 0) === 0 && <p className="text-sm text-gray-600">Nenhuma ainda.</p>}
          <ul className="divide-y divide-gray-100">
            {dados?.trocas.map((t) => (
              <li key={t.id} className="py-2 text-sm">
                <span className="text-gray-600">{dt(t.em)}</span> — {t.descricao}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
