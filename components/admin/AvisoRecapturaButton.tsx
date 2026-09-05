'use client'

import { useState } from 'react'

/**
 * QUEM PRECISA DE FOTO NOVA — a lista, por stand.
 *
 * ⚠️ O ENVIO POR E-MAIL NÃO É O CANAL ADOTADO (decisão de 04/09/2026). A
 * organização repassa aos gestores pelo canal próprio dela. O que esta tela
 * serve é a LISTA — daí o botão "Copiar lista" ser a ação primária e o envio
 * ficar atrás de um passo a mais, com aviso. Não é botão esquecido: é caminho
 * construído e deliberadamente não adotado.
 *
 * ── Por que existe (04/09/2026) ───────────────────────────────────────────
 * O endpoint `/api/admin/eventos/[slug]/avisar-recaptura` já funcionava e não
 * tinha chamador nenhum na interface. Endpoint que só responde a curl é
 * endpoint que só uma pessoa usa — e a recaptura deixou de ser conserto
 * pontual: com aprovações entrando toda semana, cada lote produz gente cuja
 * foto o equipamento recusa.
 *
 * ── Por que a prévia vem antes, sempre ────────────────────────────────────
 * Enviar e-mail em nome da organização para dezenas de responsáveis é ação
 * externa e irreversível. O `GET` não envia nada e mostra exatamente quem
 * receberia o quê; o `POST` só acontece depois de o operador ver a lista.
 *
 * ── Por que escolher a CLASSE, e não mandar tudo ──────────────────────────
 * As quatro origens não têm a mesma urgência, e isso foi medido, não suposto:
 * das 47 fotos que o nosso gate marcou como risco e que chegaram ao
 * equipamento, o equipamento aceitou as 47 — e as 4 que ele recusou não
 * estavam marcadas por nós. Já `sem-foto` e `recusada-device` são fato e
 * veredito: quem está nelas comprovadamente não entra.
 *
 * Por isso as duas concretas vêm marcadas e as duas de risco vêm desmarcadas.
 * Não é preferência de layout: mandar as quatro juntas seriam 86 pedidos onde
 * 11 são os que importam, gastando a paciência dos gestores justamente antes da
 * feira. Quem quiser incluir as de risco, marca — a informação está na tela.
 */

type Tipo = 'sem-foto' | 'recusada-device' | 'nao-validada' | 'medida-baixa'

const CLASSES: { tipo: Tipo; rotulo: string; explica: string; concreta: boolean }[] = [
  {
    tipo: 'sem-foto',
    rotulo: 'Sem foto',
    explica: 'Não há foto no cadastro. Não entra no evento — é fato, não estimativa.',
    concreta: true
  },
  {
    tipo: 'recusada-device',
    rotulo: 'Recusada pelo equipamento',
    explica: 'O terminal recebeu a foto e não conseguiu usá-la. Não entra no evento.',
    concreta: true
  },
  {
    tipo: 'nao-validada',
    rotulo: 'Sem validação',
    explica: 'A captura não confirmou rosto. Risco que só aparece no portão — o equipamento aceitou todas as que chegaram até ele.',
    concreta: false
  },
  {
    tipo: 'medida-baixa',
    rotulo: 'Rosto pequeno',
    explica: 'Rosto perto do piso da medição. Mesmo caso: o equipamento aceitou todas as que chegaram.',
    concreta: false
  }
]

interface PessoaPrevia { nome: string; motivo: string; tipo?: Tipo }
interface StandPrevia {
  standId: string
  code: string
  name: string
  email: string | null
  temEmail: boolean
  pessoas: PessoaPrevia[]
}
interface Previa {
  evento: string
  lote: number
  totalStands: number
  totalPessoas: number
  porTipo: Record<string, number>
  semEmail: string[]
  stands: StandPrevia[]
}

export default function AvisoRecapturaButton({ slug }: { slug: string }) {
  const [aberto, setAberto] = useState(false)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mostrarEnvio, setMostrarEnvio] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  // As concretas marcadas; as de risco não. Ver o cabeçalho.
  const [selecionadas, setSelecionadas] = useState<Set<Tipo>>(
    new Set<Tipo>(['sem-foto', 'recusada-device'])
  )

  const abrir = async () => {
    setAberto(true)
    setErro(null)
    setResultado(null)
    setCarregando(true)
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/avisar-recaptura`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não foi possível carregar a prévia')
      setPrevia(j)
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao carregar')
    } finally {
      setCarregando(false)
    }
  }

  const alternar = (t: Tipo) => {
    setSelecionadas((s) => {
      const n = new Set(s)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }

  // Recorte do que está marcado — é o que a tela mostra E o que o POST envia.
  const standsFiltrados = (previa?.stands ?? [])
    .map((s) => ({ ...s, pessoas: s.pessoas.filter((p) => p.tipo && selecionadas.has(p.tipo)) }))
    .filter((s) => s.pessoas.length > 0)
  const totalPessoas = standsFiltrados.reduce((a, s) => a + s.pessoas.length, 0)
  const comEmail = standsFiltrados.filter((s) => s.temEmail)
  const semEmail = standsFiltrados.filter((s) => !s.temEmail)

  const enviar = async () => {
    if (!confirm(
      `Enviar pedido de foto nova para ${comEmail.length} responsável(is), ` +
      `sobre ${totalPessoas} pessoa(s)?\n\n` +
      'Isto manda e-mail em nome da organização e não tem como desfazer.'
    )) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/avisar-recaptura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todos: true, tipos: [...selecionadas] })
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha no envio')
      const partes = [`${j.enviados?.length ?? 0} e-mail(s) enviado(s)`]
      if (j.falhas?.length) partes.push(`${j.falhas.length} falha(s)`)
      if (j.semEmail?.length) partes.push(`${j.semEmail.length} stand(s) sem e-mail`)
      if (j.restantes) partes.push(`${j.restantes} restante(s) — clique de novo para continuar`)
      setResultado(partes.join(' · '))
      await abrirSilencioso()
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao enviar')
    } finally {
      setEnviando(false)
    }
  }

  // Recarrega a prévia após enviar, sem piscar a tela inteira.
  const abrirSilencioso = async () => {
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/avisar-recaptura`)
      if (r.ok) setPrevia(await r.json())
    } catch { /* a prévia velha continua servindo */ }
  }

  /** Texto plano para repassar por WhatsApp/documento: nome, stand e o que fazer. */
  const textoDaLista = () => {
    const L: string[] = [`PESSOAS QUE PRECISAM DE FOTO NOVA — ${previa?.evento ?? ''}`, '']
    for (const s of standsFiltrados) {
      L.push(`STAND ${s.code}`)
      for (const p of s.pessoas) L.push(`  - ${p.nome} — ${p.motivo}`)
      L.push('')
    }
    L.push('O QUE A PESSOA PRECISA FAZER:')
    L.push('Tirar uma foto nova. A organização envia um link individual para cada uma;')
    L.push('ela abre no celular e faz a captura. Depois disso, o cadastro precisa ser')
    L.push('APROVADO de novo no painel — sem essa aprovação a pessoa não entra no evento.')
    return L.join(String.fromCharCode(10))
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoDaLista())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar. Selecione o texto da lista manualmente.')
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        className="inline-flex items-center px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-sm"
        title="Pedir foto nova aos responsáveis dos stands"
      >
        📸 <span className="hidden sm:inline ml-1">Pedir fotos</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setAberto(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Pedir foto nova</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Lista por stand, para repassar aos responsáveis. <strong>O envio por
                  e-mail não é o canal adotado</strong> — copie a lista.
                </p>
              </div>
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Fechar">×</button>
            </div>

            <div className="overflow-auto p-6 space-y-5 flex-1">
              {carregando && <p className="text-sm text-gray-500">Carregando prévia…</p>}
              {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{erro}</p>}
              {resultado && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{resultado}</p>}

              {previa && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Quem avisar</h3>
                    <div className="space-y-2">
                      {CLASSES.map((c) => {
                        const n = previa.porTipo?.[c.tipo] ?? 0
                        return (
                          <label
                            key={c.tipo}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                              selecionadas.has(c.tipo) ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
                            } ${n === 0 ? 'opacity-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selecionadas.has(c.tipo)}
                              disabled={n === 0}
                              onChange={() => alternar(c.tipo)}
                            />
                            <span className="flex-1">
                              <span className="font-medium text-gray-900">
                                {c.rotulo} — {n} pessoa{n === 1 ? '' : 's'}
                              </span>
                              {c.concreta && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-medium">não entra</span>
                              )}
                              <span className="block text-xs text-gray-600 mt-0.5">{c.explica}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
                    Vai avisar <strong>{comEmail.length}</strong> responsável(is) sobre{' '}
                    <strong>{totalPessoas}</strong> pessoa(s).
                    {semEmail.length > 0 && (
                      <span className="block text-amber-800 mt-1">
                        ⚠ {semEmail.length} stand(s) sem e-mail cadastrado ficam de fora:{' '}
                        {semEmail.map((s) => s.code).join(', ')}
                      </span>
                    )}
                    {comEmail.length > previa.lote && (
                      <span className="block text-gray-600 mt-1">
                        O envio vai em lotes de {previa.lote} stands. Depois do primeiro, clique de novo para continuar.
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">
                      Prévia — exatamente quem recebe o quê
                    </h3>
                    {standsFiltrados.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhuma pessoa nas classes marcadas.</p>
                    ) : (
                      <ul className="space-y-3">
                        {standsFiltrados.map((s) => (
                          <li key={s.standId} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium text-gray-900">{s.code}</span>
                              <span className={`text-xs ${s.temEmail ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                                {s.email ?? 'sem e-mail — não recebe'}
                              </span>
                            </div>
                            <ul className="mt-1.5 text-sm text-gray-700 space-y-0.5">
                              {s.pessoas.map((p, i) => (
                                <li key={i}>• {p.nome} — <span className="text-gray-500">{p.motivo}</span></li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t bg-gray-50 flex flex-wrap justify-between items-center gap-3">
              <button onClick={() => setAberto(false)} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm font-medium">
                Fechar
              </button>
              <div className="flex items-center gap-3">
                {!mostrarEnvio ? (
                  <button
                    onClick={() => setMostrarEnvio(true)}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                    title="O e-mail não é o canal adotado — a organização repassa pelo canal dela"
                  >
                    enviar por e-mail
                  </button>
                ) : (
                  <button
                    onClick={enviar}
                    disabled={enviando || comEmail.length === 0}
                    className="px-4 py-2 rounded-lg border border-amber-500 bg-white text-amber-800 text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
                    title="E-mail não é o canal adotado. Confirme só se souber por quê."
                  >
                    {enviando ? 'Enviando…' : `⚠ Enviar e-mail a ${comEmail.length} responsável(is)`}
                  </button>
                )}
                <button
                  onClick={copiar}
                  disabled={totalPessoas === 0}
                  className="px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copiado ? '✓ Copiado' : `Copiar lista (${totalPessoas})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
