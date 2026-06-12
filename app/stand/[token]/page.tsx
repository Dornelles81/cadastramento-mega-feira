import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '../../../lib/prisma'
import { checkRateLimit } from '../../../lib/rate-limit'
import {
  validateStandToken,
  registerPanelAccess,
  maskDocument
} from '../../../lib/stand-access/validate'
import { getFaceImageDataUrl } from '../../../lib/face-image'

// Painel do responsável do stand (SPEC seção 2.2) — acesso via link mágico.
// Todas as queries são filtradas pelo standId derivado do token no servidor;
// nenhuma informação de outros stands aparece nesta rota.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Painel do Stand — Mega Credenciamento',
  robots: { index: false, follow: false }
}

const NAVY = '#1E3A5F'
const TEAL = '#2DD4BF'

export default async function StandPanelPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') || '').split(',')[0].trim() || null
  const userAgent = hdrs.get('user-agent')

  // Rate limit por IP (SPEC seção 3) contra enumeração de tokens
  if (!checkRateLimit(`stand-panel:${ip ?? 'unknown'}`, 30, 60_000)) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Muitas tentativas</h1>
          <p className="text-gray-600">Aguarde alguns instantes e tente novamente.</p>
        </div>
      </main>
    )
  }

  const access = await validateStandToken(token)
  if (!access) notFound()

  await registerPanelAccess(access, { ip, userAgent })

  const participants = await prisma.participant.findMany({
    where: {
      standId: access.stand.id,
      status: 'active',
      isDeleted: false
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      createdAt: true,
      faceImageUrl: true,
      faceData: true
    },
    orderBy: { createdAt: 'desc' }
  })

  // Miniatura: decripta a biometria server-side (formato novo) ou usa o
  // data URL legado — nunca expõe o payload criptografado ao client
  const withPhotos = participants.map((p) => ({
    id: p.id,
    name: p.name,
    cpf: p.cpf,
    createdAt: p.createdAt,
    photo: getFaceImageDataUrl(p)
  }))

  const count = participants.length
  const limit = access.stand.maxRegistrations
  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 100
  const isFull = count >= limit

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: NAVY }} className="px-4 py-6">
        <div className="max-w-3xl mx-auto">
          <p style={{ color: TEAL }} className="text-sm font-semibold">
            {access.event.name}
          </p>
          <h1 className="text-2xl font-bold text-white mt-1">{access.stand.name}</h1>
          <p className="text-sm text-gray-300 mt-1">
            <code className="bg-white/10 px-2 py-0.5 rounded">{access.stand.code}</code>
            {access.stand.location && <span className="ml-2">{access.stand.location}</span>}
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Ocupação */}
        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Ocupação</h2>
            <p className="text-sm text-gray-500">
              <span
                className={`text-2xl font-bold ${isFull ? 'text-red-600' : 'text-gray-900'}`}
              >
                {count}
              </span>{' '}
              / {limit} vagas
            </p>
          </div>
          <div className="bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: isFull ? '#DC2626' : TEAL
              }}
            />
          </div>
          {isFull ? (
            <p className="text-sm text-red-600 font-medium mt-3">
              Stand lotado — para liberar uma vaga, exclua um credenciado.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-3">
              {limit - count} vaga{limit - count !== 1 ? 's' : ''} disponíve
              {limit - count !== 1 ? 'is' : 'l'}.
            </p>
          )}

          <div className="mt-4">
            {isFull ? (
              <span className="inline-block w-full sm:w-auto text-center px-6 py-3 rounded-xl bg-gray-200 text-gray-500 font-semibold cursor-not-allowed">
                Cadastrar credenciado
              </span>
            ) : (
              <Link
                href={`/stand/${token}/cadastro`}
                style={{ backgroundColor: TEAL, color: NAVY }}
                className="inline-block w-full sm:w-auto text-center px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
              >
                Cadastrar credenciado
              </Link>
            )}
          </div>
        </section>

        {/* Lista de credenciados */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Credenciados ({count})
          </h2>

          {count === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium">Nenhum credenciado cadastrado ainda.</p>
              <p className="text-sm mt-1">
                Compartilhe este link com sua equipe ou use o botão acima para cadastrar.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {withPhotos.map((p) => (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">
                        &#128100;
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-sm text-gray-500">{maskDocument(p.cpf)}</p>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-nowrap">
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeZone: 'America/Sao_Paulo'
                    }).format(p.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-gray-400 text-center pb-6">
          Este painel é exclusivo do seu stand. Em caso de dúvidas, contate a
          organização do evento.
        </p>
      </div>
    </main>
  )
}
