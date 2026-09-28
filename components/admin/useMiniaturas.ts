'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Miniaturas da lista de participantes, pedidas SÓ para as linhas que estão
 * na tela, em lote, e guardadas só na memória da aba.
 *
 * Feito para a rede ruim da feira e para o operador que rola a lista rápido
 * procurando alguém:
 *
 *  - A linha nunca espera a foto. Quem desenha o círculo mostra as iniciais
 *    no mesmo tamanho até a miniatura chegar — sem buraco, sem pulo de layout,
 *    e o botão já é clicável.
 *  - Linha que passou voando não gera pedido: o lote é montado DEPOIS de uma
 *    pausa curta (ESPERA_MS) e só leva quem continua visível naquele momento.
 *  - No máximo MAX_EM_VOO pedidos ao mesmo tempo. Numa conexão ruim, abrir
 *    dezenas de requisições em paralelo só faz todas chegarem tarde.
 *  - Pedido que demora mais que TIMEOUT_MS é abortado e volta para a fila;
 *    depois de MAX_TENTATIVAS, o id desiste e fica com as iniciais.
 *
 * Nada vai para localStorage/IndexedDB: miniatura de rosto é biometria, e o
 * celular do operador não é lugar para guardá-la.
 */

const LOTE = 40 // = MAX_IDS do endpoint
const MAX_EM_VOO = 2
const ESPERA_MS = 150
const TIMEOUT_MS = 15_000
const RETRY_MS = 3_000
const MAX_TENTATIVAS = 3
const MARGEM = '300px 0px' // começa a pedir um pouco antes de a linha aparecer

export function useMiniaturas(slug: string | undefined) {
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({})

  const visiveis = useRef(new Set<string>())
  const resolvidos = useRef(new Set<string>()) // já tem resposta (foto ou "sem foto") ou desistiu
  const emVoo = useRef(new Set<string>())
  const tentativas = useRef(new Map<string, number>())
  const ativos = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const observer = useRef<IntersectionObserver | null>(null)
  const elementos = useRef(new Map<string, Element>())
  const refs = useRef(new Map<string, (el: Element | null) => void>())
  const controles = useRef(new Set<AbortController>())
  const vivo = useRef(true)
  const slugRef = useRef(slug)
  slugRef.current = slug

  const agendar = useCallback((ms: number = ESPERA_MS) => {
    if (!vivo.current || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      despachar()
    }, ms)
    // despachar é estável (definida abaixo com refs); a dependência vazia é intencional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buscar = useCallback((lote: string[]) => {
    const s = slugRef.current
    if (!s) return
    lote.forEach((id) => emVoo.current.add(id))
    ativos.current++
    const ctrl = new AbortController()
    controles.current.add(ctrl)
    const prazo = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let desistirDoLote = false

    fetch(`/api/admin/eventos/${encodeURIComponent(s)}/miniaturas?ids=${lote.join(',')}`, {
      signal: ctrl.signal,
      cache: 'no-store'
    })
      .then(async (r) => {
        if (r.ok) return r.json()
        // 4xx (fora 408/429) não melhora tentando de novo: sem permissão, id inválido.
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) desistirDoLote = true
        throw new Error(`HTTP ${r.status}`)
      })
      .then((data: { miniaturas?: Record<string, string> }) => {
        // Todo id do lote foi ATENDIDO — com foto, "sem foto", ou fora do escopo
        // (o endpoint não diz qual, de propósito). Nenhum deles volta à fila.
        lote.forEach((id) => resolvidos.current.add(id))
        const novas = data?.miniaturas ?? {}
        if (vivo.current && Object.keys(novas).length) {
          setMiniaturas((prev) => ({ ...prev, ...novas }))
        }
      })
      .catch(() => {
        for (const id of lote) {
          const n = (tentativas.current.get(id) ?? 0) + 1
          tentativas.current.set(id, n)
          if (desistirDoLote || n >= MAX_TENTATIVAS) resolvidos.current.add(id)
        }
        agendar(RETRY_MS)
      })
      .finally(() => {
        clearTimeout(prazo)
        controles.current.delete(ctrl)
        lote.forEach((id) => emVoo.current.delete(id))
        ativos.current--
        agendar(0) // abriu vaga: segue a fila, se ainda houver alguém visível
      })
  }, [agendar])

  function despachar() {
    while (ativos.current < MAX_EM_VOO) {
      const lote: string[] = []
      for (const id of visiveis.current) {
        if (resolvidos.current.has(id) || emVoo.current.has(id)) continue
        lote.push(id)
        if (lote.length === LOTE) break
      }
      if (lote.length === 0) return
      buscar(lote)
    }
  }

  const obs = useCallback((): IntersectionObserver | null => {
    if (observer.current) return observer.current
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null
    observer.current = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.miniaturaId
          if (!id) continue
          if (e.isIntersecting) visiveis.current.add(id)
          else visiveis.current.delete(id)
        }
        agendar()
      },
      { rootMargin: MARGEM }
    )
    return observer.current
  }, [agendar])

  /**
   * Ref para o elemento da linha que mostra a foto. Estável por id: a mesma
   * função volta em todo render, então o React não desobserva e reobserva
   * 2 mil linhas a cada tecla digitada na busca.
   */
  const refMiniatura = useCallback((id: string) => {
    let fn = refs.current.get(id)
    if (!fn) {
      fn = (el: Element | null) => {
        const o = obs()
        const anterior = elementos.current.get(id)
        if (anterior && anterior !== el) {
          o?.unobserve(anterior)
          elementos.current.delete(id)
        }
        if (el) {
          ;(el as HTMLElement).dataset.miniaturaId = id
          elementos.current.set(id, el)
          o?.observe(el)
        } else {
          visiveis.current.delete(id)
        }
      }
      refs.current.set(id, fn)
    }
    return fn
  }, [obs])

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      controles.current.forEach((c) => c.abort())
      observer.current?.disconnect()
      observer.current = null
    }
  }, [])

  return { miniaturas, refMiniatura }
}
