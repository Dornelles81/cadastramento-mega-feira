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

// Mesmas cores do painel do stand (app/stand/[token]/page.tsx).
const NAVY = '#1E3A5F'
const TEAL = '#2DD4BF'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Cadastro de Credenciado — Mega Credenciamento',
  robots: { index: false, follow: false }
}

export default async function StandCadastroPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { token } = await params

  // ── MODO BALCÃO ───────────────────────────────────────────────────────────
  // `?balcao=1` na URL habilita o botão "Cadastrar outra pessoa" na tela final.
  // NÃO é barreira de segurança e não pretende ser: o link de cadastro já
  // permite N inscrições por natureza, e quem descobrir o parâmetro não ganha
  // capacidade nenhuma que já não tivesse. O que ele remove é o CONVITE.
  //
  // No celular do participante, aquele botão pede que UMA pessoa cadastre
  // OUTRAS do próprio aparelho — e aí o consentimento passa a ser marcado por
  // quem não é o titular, com `consentIp`/`consentText` gravados em nome de
  // alguém que nunca viu a tela. Isso é problema de LGPD, não só de higiene de
  // link.
  //
  // Parâmetro, e não terceiro tipo de link, de propósito: é o MESMO link, num
  // modo visível na própria URL. Um terceiro token traria geração, revogação,
  // validade e mais uma coisa para confundir com as duas que já existem.
  const sp = await searchParams
  const modoBalcao = (Array.isArray(sp?.balcao) ? sp.balcao[0] : sp?.balcao) === '1'

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

  // ── SÓ O LINK DE CADASTRO CHEGA AO FORMULÁRIO ─────────────────────────────
  // A trava real é a de `/api/stand-registration`; esta existe para ela não
  // virar um beco sem saída. Sem este bloco, quem abrisse o formulário com o
  // link de gestão preencheria os dados, tiraria a foto e só descobriria no
  // envio — depois de todo o trabalho. Recusar antes explica na hora e diz o
  // que fazer.
  if (access.scope !== 'register') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Este link não faz cadastro</h1>
          <p className="text-gray-600">
            Você está com o <strong>link de gestão</strong> do stand {access.stand.name}, usado
            para acompanhar a equipe já credenciada.
          </p>
          <p className="text-gray-600 mt-3">
            Para se cadastrar, peça à organização o <strong>link de cadastro</strong> — é ele que
            deve ser compartilhado com quem vai se credenciar.
          </p>
          <a
            href={`/stand/${token}`}
            className="inline-block mt-5 px-5 py-2.5 rounded-xl font-semibold"
            style={{ backgroundColor: TEAL, color: NAVY }}
          >
            Voltar ao painel do stand
          </a>
        </div>
      </main>
    )
  }

  const now = new Date()
  // Ocupação canônica (Fase 7): ativos + slots travados por exclusão com
  // check-in no dia contam como ocupados até a virada
  const [occupiedCount, nextLocked, eventConfig, eventoAprovacao] = await Promise.all([
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
          select: {
            requireFace: true, logoUrl: true, consentTermVersion: true,
            // Quem aprova neste evento decide o texto da tela final.
            standApprovalEnabled: true
          }
        })
      : Promise.resolve(null),
    // Este evento exige aprovação para o acesso valer? É o mesmo campo que a
    // elegibilidade do sync consulta — o texto da tela final não pode prometer
    // uma coisa e o portão fazer outra.
    access.event.id
      ? prisma.event.findUnique({
          where: { id: access.event.id },
          select: { requiresApprovalForAccess: true }
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
      modoBalcao={modoBalcao}
      aprovacao={{
        // Default TRUE quando o evento não diz nada, igual à elegibilidade
        // (`requiresApproval ?? true`): prometer acesso imediato e o portão
        // recusar seria o pior dos dois erros.
        necessaria: eventoAprovacao?.requiresApprovalForAccess !== false,
        porGestor: eventConfig?.standApprovalEnabled === true
      }}
    />
  )
}
