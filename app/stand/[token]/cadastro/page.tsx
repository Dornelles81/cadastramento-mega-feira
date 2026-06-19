import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { prisma } from '../../../../lib/prisma'
import { checkRateLimit } from '../../../../lib/rate-limit'
import { validateStandToken } from '../../../../lib/stand-access/validate'
import StandCadastroFlow from '../../../../components/stand/StandCadastroFlow'
import { occupiedSlotsWhere, formatRelease } from '../../../../lib/stand-access/occupancy'
import { renderConsent, buildConsentVars, isConsentVersionValid } from '../../../../lib/consent'

// Cadastro de credenciado via link do stand (SPEC seção 2.3).
// O stand vem exclusivamente do token validado no servidor.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Cadastro de Credenciado — Mega Credenciamento',
  robots: { index: false, follow: false }
}

export default async function StandCadastroPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (!checkRateLimit(`stand-panel:${ip}`, 30, 60_000)) {
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

  const now = new Date()
  // Ocupação canônica (Fase 7): ativos + slots travados por exclusão com
  // check-in no dia contam como ocupados até a virada
  const [occupiedCount, nextLocked, eventConfig] = await Promise.all([
    prisma.participant.count({ where: occupiedSlotsWhere(access.stand.id, now) }),
    prisma.participant.findFirst({
      where: {
        standId: access.stand.id,
        status: 'removed',
        isDeleted: false,
        slotLockedUntil: { gt: now }
      },
      orderBy: { slotLockedUntil: 'asc' },
      select: { slotLockedUntil: true }
    }),
    access.event.id
      ? prisma.eventConfig.findUnique({
          where: { eventId: access.event.id },
          select: { requireFace: true, logoUrl: true, consentTermVersion: true }
        })
      : Promise.resolve(null)
  ])

  // Termo versionado (LGPD): renderizado no servidor (fonte da verdade = DB).
  // null = evento não ativou → fluxo de consentimento antigo do stand.
  const activeTermVersion = isConsentVersionValid(eventConfig?.consentTermVersion)
    ? eventConfig!.consentTermVersion!
    : null
  const fullEvent = activeTermVersion && access.event.id
    ? await prisma.event.findUnique({
        where: { id: access.event.id },
        select: {
          name: true, startDate: true, endDate: true,
          venueName: true, venueAddress: true, venueCity: true, venueState: true,
          organizerEmail: true
        }
      })
    : null
  const consentTerm = activeTermVersion && fullEvent
    ? renderConsent(activeTermVersion, buildConsentVars(fullEvent))
    : null

  return (
    <StandCadastroFlow
      token={token}
      stand={{
        name: access.stand.name,
        code: access.stand.code,
        location: access.stand.location,
        maxRegistrations: access.stand.maxRegistrations,
        activeCount: occupiedCount,
        nextRelease: nextLocked?.slotLockedUntil
          ? formatRelease(nextLocked.slotLockedUntil)
          : null
      }}
      event={{
        name: access.event.name,
        code: access.event.code ?? '',
        logoUrl: eventConfig?.logoUrl ?? null
      }}
      requireFace={eventConfig?.requireFace !== false}
      consentTermVersion={activeTermVersion}
      consentTerm={consentTerm}
    />
  )
}
