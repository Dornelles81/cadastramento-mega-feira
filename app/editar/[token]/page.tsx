import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { checkRateLimit } from '../../../lib/rate-limit'
import { validateEditToken, touchEditToken } from '../../../lib/participant-edit/validate'

// Edição self-service do próprio cadastro via link mágico (Grupo D).
// Valida o token server-side; token inválido/revogado/expirado → 404 amigável.
// Encaminha para o editor (página do evento em modo edição por token).

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Atualizar Cadastro — Mega Credenciamento',
  robots: { index: false, follow: false }
}

export default async function EditarPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (!checkRateLimit(`editar:${ip}`, 30, 60_000)) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Muitas tentativas</h1>
          <p className="text-gray-600">Aguarde alguns instantes e tente novamente.</p>
        </div>
      </main>
    )
  }

  const access = await validateEditToken(token)
  if (!access) notFound()

  await touchEditToken(access.tokenId)

  // Reaproveita o editor da página do evento em modo edição por token.
  const slug = access.event.slug
  if (!slug) notFound()
  redirect(`/eventos/${slug}?editToken=${token}`)
}
