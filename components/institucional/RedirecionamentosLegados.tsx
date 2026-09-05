'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Os dois redirecionamentos de compatibilidade da raiz — e MAIS NADA.
 *
 * ── Por que isto é um componente separado ─────────────────────────────────
 * `useSearchParams()` só existe no cliente. Se ele for usado dentro da árvore
 * que desenha a página, o Next.js marca a rota inteira com
 * BAILOUT_TO_CLIENT_SIDE_RENDERING: o HTML servido sai VAZIO e o conteúdo só
 * aparece depois que o JS roda.
 *
 * Numa página institucional isso é grave de um jeito que não aparece em dev
 * (onde o servidor de desenvolvimento entrega o conteúdo mesmo assim): em
 * produção o buscador vê uma página em branco — sem texto, sem logo, sem link
 * — e quem abre com conexão ruim vê branco antes do conteúdo. Foi o que
 * aconteceu no primeiro deploy de 04/09/2026.
 *
 * Isolando o hook aqui, o Suspense que ele exige envolve só este componente,
 * que não desenha nada. A página fica estática e pré-renderizada, com o HTML
 * completo no servidor.
 *
 * Não acrescente markup aqui: qualquer coisa visível volta a depender do
 * cliente.
 */
export default function RedirecionamentosLegados() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Compatibilidade 1: ?event=<slug> → página do evento.
    const eventSlug = searchParams.get('event')
    if (eventSlug) {
      router.replace(`/eventos/${eventSlug}`)
      return
    }

    // Compatibilidade 2: link ?update=<uuid> ANTIGO (sem token de posse): nao
    // buscar PII nenhum. Redireciona direto para a pagina amigavel, ANTES de
    // qualquer query — a edicao agora exige o link tokenizado /editar/<token>
    // (Grupo D).
    const updateId = searchParams.get('update')
    if (updateId) {
      router.replace('/editar/expirado')
      return
    }
  }, [searchParams, router])

  return null
}
