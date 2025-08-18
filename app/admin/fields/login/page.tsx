'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FieldsLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'login' })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Store auth token in sessionStorage
        sessionStorage.setItem('adminFieldsAuth', data.token)
        router.push('/admin/fields')
      } else {
        setError(data.error || 'Senha incorreta')
      }
    } catch (err) {
      setError('Erro ao fazer login. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-mega-50 to-mega-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-mega-100 rounded-full mb-4">
              <span className="text-2xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              Acesso Restrito
            </h1>
            <p className="text-gray-600 mt-2">
              Gerenciamento de Campos do Formulário
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha de Administrador
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-mega-500 focus:border-mega-500"
                placeholder="Digite a senha"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-mega-500 text-white rounded-lg font-semibold hover:bg-mega-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Verificando...' : '🔓 Acessar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>💡 Dica:</strong> A senha padrão é "megafeira2025"
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/admin"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Voltar para Admin
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}