'use client'

import { useEffect, useRef, useState } from 'react'
import EnhancedFaceCapture from '../EnhancedFaceCapture'

/**
 * Balcão de recoleta facial — tela do operador, no celular.
 *
 * Fluxo: documento → conferência (foto atual, nome, stand) → foto nova →
 * revisão lado a lado + declaração de conferência → salvar → acompanhar os
 * terminais até "chegou" ou "recusada, tire outra".
 *
 * A etapa final existe porque a pessoa veio ao balcão depois de a porta não
 * abrir: se sair daqui sem a confirmação dos terminais, pode ser barrada de novo.
 *
 * Cores sempre explícitas: o <body> do app é `text-white` (app/layout.tsx), e
 * texto sem cor aqui sairia branco no fundo claro.
 */

type EstadoTerminais =
  | { estado: 'ok'; terminais: number }
  | { estado: 'recusada'; terminais: number; recusaram: number; motivo: 'foto-grande' | 'modelagem' | 'outro' }
  | { estado: 'pendente'; terminais: number; chegou: number }
  | { estado: 'nao-aprovado' }
  | { estado: 'sem-terminal' }

interface Pessoa {
  nome: string
  stand: string | null
  documento: string
  aprovacao: string
  temFoto: boolean
  fotoAtual: string | null
}

type Etapa = 'busca' | 'conferir' | 'camera' | 'revisar' | 'enviando' | 'acompanhando'

const INTERVALO_MS = 2000
const AVISO_DEMORA_MS = 60_000
const DESISTE_MS = 180_000

async function postar(url: string, body: unknown, timeoutMs = 20_000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: ctrl.signal
    })
    const json = await r.json().catch(() => ({}))
    return { status: r.status, json }
  } finally {
    clearTimeout(t)
  }
}

// FORA do componente, de propósito: definido lá dentro, seria um tipo novo a
// cada render e o React remontaria o cartão — o campo do documento perderia o
// foco a cada tecla.
function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="bg-white text-gray-900 rounded-2xl shadow-sm border border-gray-200 p-4">{children}</div>
}

export default function BalcaoRecoleta({ token, evento, operador }: { token: string; evento: string; operador: string }) {
  const base = `/api/balcao/${encodeURIComponent(token)}`
  const [etapa, setEtapa] = useState<Etapa>('busca')
  const [documento, setDocumento] = useState('')
  const [pessoa, setPessoa] = useState<Pessoa | null>(null)
  const [antes, setAntes] = useState<EstadoTerminais | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [fotoNova, setFotoNova] = useState<string | null>(null)
  const [metricas, setMetricas] = useState<any>(null)
  const [conferiu, setConferiu] = useState(false)
  const [depois, setDepois] = useState<EstadoTerminais | null>(null)
  const [demorando, setDemorando] = useState(false)
  const [desistiu, setDesistiu] = useState(false)
  const [trocadaEm, setTrocadaEm] = useState<string | null>(null)
  const poll = useRef<{ timer: ReturnType<typeof setTimeout> | null; vivo: boolean }>({ timer: null, vivo: true })

  useEffect(() => {
    const p = poll.current
    return () => {
      p.vivo = false
      if (p.timer) clearTimeout(p.timer)
    }
  }, [])

  function pararPoll() {
    if (poll.current.timer) clearTimeout(poll.current.timer)
    poll.current.timer = null
  }

  function recomecar() {
    pararPoll()
    setEtapa('busca')
    setDocumento('')
    setPessoa(null)
    setAntes(null)
    setErro(null)
    setFotoNova(null)
    setMetricas(null)
    setConferiu(false)
    setDepois(null)
    setDemorando(false)
    setDesistiu(false)
    setTrocadaEm(null)
  }

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault()
    if (!documento.trim() || ocupado) return
    setOcupado(true)
    setErro(null)
    try {
      const { status, json } = await postar(`${base}/buscar`, { documento })
      if (status === 200) {
        setPessoa(json.pessoa)
        setAntes(json.terminais)
        setEtapa('conferir')
      } else if (status === 409 || (status === 404 && json.error === 'nao-encontrado')) {
        setErro(json.message ?? 'Nenhum cadastro com esse documento.')
      } else if (status === 404) {
        // 404 sem 'nao-encontrado' é o LINK: revogado, expirado ou inválido.
        setErro('Este link de balcão não vale mais. Peça um novo à organização.')
      } else if (status === 429) {
        setErro('Muitas buscas seguidas. Aguarde um minuto.')
      } else {
        setErro('Não foi possível buscar agora. Tente de novo.')
      }
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  async function salvar() {
    if (!fotoNova || !conferiu || ocupado) return
    setOcupado(true)
    setErro(null)
    setEtapa('enviando')
    try {
      const { status, json } = await postar(`${base}/trocar-foto`, { documento, faceImage: fotoNova, faceData: metricas, conferiu: true }, 45_000)
      if (status === 200 && json.trocadaEm) {
        setDepois(null)
        setDemorando(false)
        setDesistiu(false)
        setTrocadaEm(json.trocadaEm)
        setEtapa('acompanhando')
        acompanhar(json.trocadaEm, Date.now())
      } else if (status === 413) {
        setErro('A foto ficou grande demais para o terminal. Tire de novo.')
        setEtapa('revisar')
      } else {
        setErro(json.message ?? json.error ?? 'Não foi possível salvar. Tente de novo.')
        setEtapa('revisar')
      }
    } catch {
      setErro('A conexão caiu no envio. Tente salvar de novo.')
      setEtapa('revisar')
    } finally {
      setOcupado(false)
    }
  }

  function acompanhar(desde: string, inicio: number) {
    pararPoll()
    const tick = async () => {
      if (!poll.current.vivo) return
      try {
        const { status, json } = await postar(`${base}/terminais`, { documento, desde }, 10_000)
        if (status === 200 && json.terminais) {
          setDepois(json.terminais)
          const fim = json.terminais.estado !== 'pendente'
          if (fim) return
        }
      } catch {
        // rede ruim: tenta de novo no próximo ciclo
      }
      const decorrido = Date.now() - inicio
      if (decorrido > AVISO_DEMORA_MS) setDemorando(true)
      if (decorrido > DESISTE_MS) { setDesistiu(true); return }
      poll.current.timer = setTimeout(tick, INTERVALO_MS)
    }
    tick()
  }

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 p-4 pb-16">
      <div className="max-w-md mx-auto space-y-4">
        <header className="pt-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">Balcão de foto · {evento}</p>
          <p className="text-sm text-gray-700">Operador: <strong>{operador}</strong></p>
        </header>

        {erro && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 text-red-900 p-3 text-sm">{erro}</div>
        )}

        {etapa === 'busca' && (
          <Cartao>
            <form onSubmit={buscar} className="space-y-3">
              <label htmlFor="doc" className="block text-base font-semibold">CPF ou documento da pessoa</label>
              <p className="text-sm text-gray-600">Digite a partir do documento com foto que ela apresentou.</p>
              <input
                id="doc"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
                placeholder="000.000.000-00"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg text-gray-900 bg-white"
              />
              <button
                type="submit"
                disabled={!documento.trim() || ocupado}
                className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 text-lg disabled:opacity-50"
              >
                {ocupado ? 'Buscando…' : 'Buscar'}
              </button>
            </form>
          </Cartao>
        )}

        {etapa === 'conferir' && pessoa && (
          <Cartao>
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Confira antes de trocar</h2>
              <div className="flex gap-3 items-start">
                {pessoa.fotoAtual ? (
                  <img src={pessoa.fotoAtual} alt="Foto atual" className="w-28 h-28 rounded-xl object-cover border border-gray-300" />
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-gray-200 flex items-center justify-center text-sm text-gray-600 text-center p-2">Sem foto</div>
                )}
                <div className="text-sm space-y-1 min-w-0">
                  <p className="text-base font-semibold break-words">{pessoa.nome}</p>
                  <p className="text-gray-700 break-words">{pessoa.stand ?? 'Sem stand'}</p>
                  <p className="text-gray-700">Documento {pessoa.documento}</p>
                  <p className={pessoa.aprovacao === 'approved' ? 'text-green-700 font-medium' : 'text-amber-800 font-medium'}>
                    {pessoa.aprovacao === 'approved' ? 'Aprovado' : 'Não aprovado ainda'}
                  </p>
                </div>
              </div>
              {antes && <LinhaTerminais estado={antes} />}
              <p className="text-sm text-gray-700">
                O rosto na sua frente é o da foto atual e o do documento? Só troque se for a mesma pessoa.
              </p>
              <button onClick={() => { setErro(null); setEtapa('camera') }} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 text-lg">
                Tirar foto nova
              </button>
              <button onClick={recomecar} className="w-full rounded-xl border border-gray-300 bg-white text-gray-800 py-3">
                Não é esta pessoa / outra busca
              </button>
            </div>
          </Cartao>
        )}

        {etapa === 'camera' && (
          // Fundo ESCURO: o componente de câmera foi desenhado para o tema do app
          // (texto branco, botões translúcidos). Num cartão branco sumiria tudo.
          <div className="bg-feira-900 text-white rounded-2xl overflow-hidden p-3">
            <EnhancedFaceCapture
              onCapture={(img, fd) => { setFotoNova(img); setMetricas(fd ?? null); setConferiu(false); setEtapa('revisar') }}
              onBack={() => setEtapa('conferir')}
            />
          </div>
        )}

        {etapa === 'revisar' && pessoa && fotoNova && (
          <Cartao>
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Antes e depois</h2>
              <div className="grid grid-cols-2 gap-3">
                <figure className="space-y-1">
                  {pessoa.fotoAtual ? (
                    <img src={pessoa.fotoAtual} alt="Foto atual" className="w-full aspect-square rounded-xl object-cover border border-gray-300" />
                  ) : (
                    <div className="w-full aspect-square rounded-xl bg-gray-200 flex items-center justify-center text-sm text-gray-600">Sem foto</div>
                  )}
                  <figcaption className="text-xs text-gray-600 text-center">Atual</figcaption>
                </figure>
                <figure className="space-y-1">
                  <img src={fotoNova} alt="Foto nova" className="w-full aspect-square rounded-xl object-cover border-2 border-teal-600" />
                  <figcaption className="text-xs text-gray-600 text-center">Nova</figcaption>
                </figure>
              </div>
              <label className="flex gap-3 items-start rounded-xl border border-gray-300 p-3 bg-gray-50">
                <input type="checkbox" checked={conferiu} onChange={(e) => setConferiu(e.target.checked)} className="mt-1 w-5 h-5" />
                <span className="text-sm text-gray-900">
                  Conferi o documento com foto: <strong>{pessoa.nome}</strong> está na minha frente e é a mesma pessoa da foto atual.
                </span>
              </label>
              <button
                onClick={salvar}
                disabled={!conferiu || ocupado}
                className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 text-lg disabled:opacity-50"
              >
                Salvar foto nova
              </button>
              <button onClick={() => setEtapa('camera')} className="w-full rounded-xl border border-gray-300 bg-white text-gray-800 py-3">
                Tirar de novo
              </button>
            </div>
          </Cartao>
        )}

        {etapa === 'enviando' && (
          <Cartao><p className="text-center py-6 text-gray-800">Salvando a foto…</p></Cartao>
        )}

        {etapa === 'acompanhando' && pessoa && (
          <Cartao>
            <div className="space-y-3">
              <h2 className="text-lg font-bold">{pessoa.nome}</h2>
              <ResultadoTerminais estado={depois} demorando={demorando} desistiu={desistiu} />
              {depois?.estado === 'recusada' && (
                <button
                  onClick={() => { setFotoNova(null); setConferiu(false); setEtapa('camera') }}
                  className="w-full rounded-xl bg-red-700 text-white font-semibold py-3 text-lg"
                >
                  Tirar outra foto
                </button>
              )}
              {desistiu && (
                <button
                  onClick={() => { if (!trocadaEm) return; setDesistiu(false); setDemorando(false); acompanhar(trocadaEm, Date.now()) }}
                  className="w-full rounded-xl border border-gray-300 bg-white text-gray-800 py-3"
                >
                  Verificar de novo
                </button>
              )}
              <button onClick={recomecar} className="w-full rounded-xl border border-gray-300 bg-white text-gray-800 py-3">
                Próxima pessoa
              </button>
            </div>
          </Cartao>
        )}
      </div>
    </main>
  )
}

function LinhaTerminais({ estado }: { estado: EstadoTerminais }) {
  const txt =
    estado.estado === 'ok' ? `A foto atual já está nos ${estado.terminais} terminais. Se a porta não abriu, a foto nova pode ajudar (luz de frente, sem boné).`
    : estado.estado === 'recusada' ? `A foto atual foi RECUSADA por ${estado.recusaram} de ${estado.terminais} terminais. Tire uma foto nova.`
    : estado.estado === 'pendente' ? `A foto atual chegou em ${estado.chegou} de ${estado.terminais} terminais.`
    : estado.estado === 'nao-aprovado' ? 'Cadastro ainda não aprovado: a foto nova fica salva, mas só vai para os terminais depois da aprovação.'
    : 'Nenhum terminal está atendendo o evento agora.'
  const cor = estado.estado === 'recusada' ? 'bg-red-50 border-red-300 text-red-900'
    : estado.estado === 'ok' ? 'bg-green-50 border-green-300 text-green-900'
    : 'bg-amber-50 border-amber-300 text-amber-900'
  return <p className={`text-sm rounded-xl border p-3 ${cor}`}>{txt}</p>
}

function ResultadoTerminais({ estado, demorando, desistiu }: { estado: EstadoTerminais | null; demorando: boolean; desistiu: boolean }) {
  if (estado?.estado === 'ok') {
    return (
      <div role="status" className="rounded-xl border-2 border-green-600 bg-green-50 text-green-900 p-4">
        <p className="text-xl font-bold">Chegou nos {estado.terminais} terminais</p>
        <p className="text-sm mt-1">Pode tentar a porta.</p>
      </div>
    )
  }
  if (estado?.estado === 'recusada') {
    const dica = estado.motivo === 'foto-grande'
      ? 'A imagem ficou grande demais para o terminal.'
      : 'O terminal não conseguiu ler o rosto. Luz de frente, sem boné nem óculos escuros, rosto centralizado e parado.'
    return (
      <div role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 text-red-900 p-4">
        <p className="text-xl font-bold">Recusada, tire outra</p>
        <p className="text-sm mt-1">{estado.recusaram} de {estado.terminais} terminais recusaram. {dica}</p>
      </div>
    )
  }
  if (estado?.estado === 'nao-aprovado') {
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-50 text-amber-900 p-4 text-sm">
        Foto salva. O cadastro ainda não está aprovado, então ela só vai para os terminais depois da aprovação. Encaminhe à organização.
      </div>
    )
  }
  if (estado?.estado === 'sem-terminal') {
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-50 text-amber-900 p-4 text-sm">
        Foto salva, mas nenhum terminal está atendendo o evento agora. Avise a organização.
      </div>
    )
  }
  const chegou = estado?.estado === 'pendente' ? estado.chegou : 0
  const total = estado?.estado === 'pendente' ? estado.terminais : null
  return (
    <div role="status" className="rounded-xl border border-gray-300 bg-gray-50 text-gray-900 p-4 space-y-1">
      <p className="text-lg font-semibold">Enviando aos terminais{total ? `: ${chegou} de ${total}` : '…'}</p>
      <p className="text-sm text-gray-700">Peça para a pessoa aguardar aqui.</p>
      {demorando && !desistiu && (
        <p className="text-sm text-amber-900">Está demorando mais que o normal. O agente dos terminais pode estar desligado. Se passar de 3 minutos, chame a organização.</p>
      )}
      {desistiu && (
        <p className="text-sm text-red-900 font-medium">Não chegou em 3 minutos. Chame a organização antes de a pessoa ir à porta.</p>
      )}
    </div>
  )
}
