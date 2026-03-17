'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
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
    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center font-bold text-3xl mb-4">
          <span className="text-verde-agua italic">MEGA</span>
          <span className="text-azul-marinho ml-2">FEIRA</span>
        </div>
        <h1 className="text-2xl font-bold text-azul-marinho mb-2">
          Painel Administrativo
        </h1>
        <p className="text-cinza">
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
          <label className="block text-sm font-medium text-azul-marinho mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-cinza-300 rounded-lg text-cinza-900 bg-white focus:ring-2 focus:ring-verde-agua focus:border-verde-agua transition-colors placeholder:text-cinza-400"
            placeholder="seu@email.com"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-azul-marinho mb-2">
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-cinza-300 rounded-lg text-cinza-900 bg-white focus:ring-2 focus:ring-verde-agua focus:border-verde-agua transition-colors placeholder:text-cinza-400"
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-verde-agua text-white rounded-lg font-semibold hover:bg-verde-agua-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {loading ? '🔄 Entrando...' : '🔓 Entrar'}
        </button>
      </form>

      {/* Footer */}
      <div className="mt-6 text-center">
        <a
          href="/"
          className="text-sm text-verde-agua hover:text-verde-agua-dark underline"
        >
          ← Voltar para o site
        </a>
      </div>
    </div>
  )
}

function LoginFormFallback() {
  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center font-bold text-3xl mb-4">
          <span className="text-verde-agua italic">MEGA</span>
          <span className="text-azul-marinho ml-2">FEIRA</span>
        </div>
        <h1 className="text-2xl font-bold text-azul-marinho mb-2">
          Painel Administrativo
        </h1>
        <p className="text-cinza">
          Carregando...
        </p>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-azul-marinho via-azul-medio to-verde-agua flex items-center justify-center p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
