'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard (which will check authentication)
    router.replace('/admin/dashboard')
  }, [router])

  return (
    <div className="min-h-screen bg-fundo-claro flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-cinza">Redirecionando para o dashboard...</p>
      </div>
    </div>
  )
}
