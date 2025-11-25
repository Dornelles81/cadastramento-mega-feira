'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      })

      if (result?.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (result?.ok) {
        // Redirect to callback URL or dashboard
        const callbackUrl = searchParams.get('callbackUrl') || '/admin/dashboard'
        router.push(callbackUrl)
      }
    } catch (err) {
      setError('Erro ao fazer login. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/mega-feira-logo.svg"
            alt="Mega Feira"
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Painel Administrativo
          </h1>
          <p className="text-gray-600">
            Sistema Multi-Evento
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm flex items-center">
              <span className="mr-2">❌</span>
              {error}
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              placeholder="seu@email.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? '🔄 Entrando...' : '🔓 Entrar'}
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            💡 Credenciais de Demonstração:
          </p>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-purple-100 p-2 rounded">
                <strong className="block text-purple-800">Super Admin:</strong>
                <code className="text-purple-700">admin@megafeira.com.br</code>
                <code className="block text-purple-700">SuperAdmin@2025</code>
              </div>
              <div className="bg-blue-100 p-2 rounded">
                <strong className="block text-blue-800">Event Admin:</strong>
                <code className="text-blue-700">evento@megafeira.com.br</code>
                <code className="block text-blue-700">EventAdmin@2025</code>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-purple-600 hover:text-purple-700 underline"
          >
            ← Voltar para o site
          </a>
        </div>
      </div>
    </div>
  )
}
