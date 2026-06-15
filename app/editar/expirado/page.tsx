// Página amigável para links de atualização antigos (?update=<uuid> sem
// token de posse) — Grupo D parte 4. Estática, não busca dado nenhum.

export const metadata = {
  title: 'Link expirado — Mega Credenciamento',
  robots: { index: false, follow: false }
}

export default function LinkEditarExpirado() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Este link de atualização expirou
        </h1>
        <p className="text-gray-600">
          O link que você usou para atualizar seu cadastro não é mais válido.
          Peça um novo link à organização do evento.
        </p>
      </div>
    </main>
  )
}
