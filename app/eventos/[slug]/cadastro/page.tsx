'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Pagina de compatibilidade - redireciona para a nova rota do evento
 * /eventos/[slug]/cadastro -> /eventos/[slug]
 */
export default function EventoCadastroRedirect() {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  useEffect(() => {
    if (slug) {
      // Preserve any query parameters (like ?update=id)
      const searchParams = new URLSearchParams(window.location.search)
      const queryString = searchParams.toString()
      const redirectUrl = `/eventos/${slug}${queryString ? `?${queryString}` : ''}`

      router.replace(redirectUrl)
    }
  }, [slug, router])

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-pulse">⏳</div>
        <p className="text-white/80 text-lg">Redirecionando...</p>
      </div>
    </div>
  )
}
