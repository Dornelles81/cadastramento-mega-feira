'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import '../../institucional.css'

/**
 * Tela de acesso ao painel.
 *
 * Reformulada em 07/09/2026 para o visual da página institucional — envolve o
 * conteúdo em `.institucional login-tela` e herda dali a fonte Archivo, as
 * variáveis de cor e o fundo branco. O estilo específico vive no bloco
 * "TELA DE LOGIN" de app/institucional.css, escopado como o resto.
 *
 * ⚠️ A MUDANÇA FOI SÓ DE APARÊNCIA. `signIn`, os campos, a validação, as
 * mensagens de erro vindas do NextAuth, o estado de carregamento e o
 * `callbackUrl` estão exatamente como estavam — o que mudou foram classes e
 * texto visível. Ao mexer aqui, mantenha essa separação.
 *
 * A marca passou a ser "megacredenciamento", com o mesmo tratamento tipográfico
 * do topo institucional: "mega" leve e estreito, "credenciamento" pesado e
 * largo. Mega Feira ficou como a linha de operadora no rodapé do cartão.
 */

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
    <div className="login-cartao">
      <span className="login-marca">
        <i>mega</i>credenciamento
      </span>

      <h1 className="login-titulo">Área do cliente</h1>
      <p className="login-sub">Acesso ao painel do seu evento.</p>

      {/* Error Message — o texto vem do NextAuth, inalterado. */}
      {error && (
        <div className="login-erro">
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit}>
        <div className="login-campo">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            disabled={loading}
          />
        </div>

        <div className="login-campo">
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>

        <button type="submit" disabled={loading} className="login-btn">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {/* Footer */}
      <div className="login-rodape">
        <a href="/">← Voltar para o site</a>
        <p className="login-operado">
          Plataforma operada por Mega Feira Tecnologia para Acessos Ltda
        </p>
      </div>
    </div>
  )
}

function LoginFormFallback() {
  return (
    <div className="login-cartao">
      <span className="login-marca">
        <i>mega</i>credenciamento
      </span>
      <h1 className="login-titulo">Área do cliente</h1>
      <p className="login-sub">Carregando...</p>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="institucional login-tela">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
