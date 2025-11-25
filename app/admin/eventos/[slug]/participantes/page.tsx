'use client'

import { useRouter, useParams } from 'next/navigation'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function EventoDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const { status } = useSession()
  const eventSlug = params?.slug as string

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Redirect to login if not authenticated
      router.replace('/admin/login')
    } else if (status === 'authenticated' && eventSlug) {
      // Redirect to event dashboard (parent route)
      router.replace(`/admin/eventos/${eventSlug}`)
    }
  }, [status, eventSlug, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-gray-600">Redirecionando para o painel do evento...</p>
      </div>
    </div>
  )
}
