import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '../../../lib/prisma'
import { checkRateLimit } from '../../../lib/rate-limit'
import {
  validateStandToken,
  registerPanelAccess,
  maskDocument
} from '../../../lib/stand-access/validate'
import { tryGetFaceImageDataUrl } from '../../../lib/face-image'
import RemoveCredenciadoButton from '../../../components/stand/RemoveCredenciadoButton'
import FotoCredenciado from '../../../components/stand/FotoCredenciado'
import AprovarCredenciadoButton from '../../../components/stand/AprovarCredenciadoButton'
import { riscoDeFace } from '../../../lib/participants/face-risk'
import { deriveFaceStatus } from '../../../lib/face/status'
import {
  lastDayReset,
  nextDayReset,
  formatRelease
} from '../../../lib/stand-access/occupancy'

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

  const now = new Date()

  // ===========================================================================
  // Ramo 'register' (link de cadastro do participante): a tela intermediária de
  // ocupação foi REMOVIDA — o participante vai direto ao formulário. A ocupação
  // é informação operacional que não lhe interessa.
  //
  // Validações preservadas downstream (nada aqui as substituía):
  //   • token revalidado em /stand/[token]/cadastro e no submit;
  //   • "stand cheio" mostrado cedo pelo StandCadastroFlow, antes do formulário;
  //   • backstop race-safe (409) na transação do submit.
  // O log de auditoria PANEL_ACCESS já foi registrado acima (registerPanelAccess).
  // redirect() lança NEXT_REDIRECT e NÃO está dentro de nenhum try/catch aqui.
  // ===========================================================================
  if (access.scope === 'register') {
    redirect(`/stand/${token}/cadastro`)
  }

  // ===========================================================================
  // Ramo 'manage': painel completo (inalterado) — ocupação + lista com
  // fotos/CPF + exclusão. Só o responsável (link de gestão) chega aqui.
  // ===========================================================================
  const eventConfig = access.event.id
    ? await prisma.event.findUnique({
        where: { id: access.event.id },
        select: {
          dayResetHour: true,
          startDate: true,
          substitutionQuotaEnabled: true,
          substitutionsPerSlot: true,
          eventConfigs: { select: { standApprovalEnabled: true } }
        }
      })
    : null
  const dayResetHour = eventConfig?.dayResetHour ?? 4

  const [participants, lockedSlots, removidos, standQuota] = await Promise.all([
    prisma.participant.findMany({
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
        approvalStatus: true,
        faceImageUrl: true,
        faceData: true,
        // Qualidade da foto: sem estes dois o painel mostra a miniatura e não
        // diz nada sobre ela. É o gestor quem tem contato com a equipe — ele
        // precisa conseguir identificar sozinho o que exige recaptura.
        faceInterocularPx: true,
        customData: true
      },
      orderBy: { createdAt: 'desc' }
    }),
    // Slots travados pela regra anti-rotatividade (Fase 7)
    prisma.participant.findMany({
      where: {
        standId: access.stand.id,
        status: 'removed',
        isDeleted: false,
        slotLockedUntil: { gt: now }
      },
      select: { slotLockedUntil: true },
      orderBy: { slotLockedUntil: 'asc' }
    }),
    // REMOVIDOS deste stand. Até 2026-09-01 o painel os escondia por completo —
    // e era essa invisibilidade que transformava o CPF bloqueado em mistério:
    // a pessoa tomava "CPF já cadastrado" no balcão e o gestor não via ninguém
    // com aquele nome na lista.
    prisma.participant.findMany({
      where: { standId: access.stand.id, status: 'removed', isDeleted: false },
      select: {
        id: true, name: true, cpf: true, removedAt: true,
        slotLockedUntil: true, faceData: true, faceImageUrl: true
      },
      orderBy: { removedAt: 'desc' }
    }),
    prisma.stand.findUnique({
      where: { id: access.stand.id },
      select: { substitutionsUsed: true }
    })
  ])

  // Quem já fez check-in no dia operacional corrente: a exclusão desses
  // trava a vaga até a próxima virada — o modal avisa antes de confirmar
  const checkinsToday = await prisma.accessLog.findMany({
    where: {
      participantId: { in: participants.map((p) => p.id) },
      type: 'ENTRY',
      createdAt: { gte: lastDayReset(dayResetHour, now) }
    },
    select: { participantId: true },
    distinct: ['participantId']
  })
  const checkedInIds = new Set(checkinsToday.map((c) => c.participantId))
  const nextResetLabel = formatRelease(nextDayReset(dayResetHour, now))

  const quotaEnabled =
    !!eventConfig?.substitutionQuotaEnabled &&
    now >= new Date(eventConfig.startDate)
  const quotaLimit = quotaEnabled
    ? access.stand.maxRegistrations * (eventConfig?.substitutionsPerSlot ?? 1)
    : 0
  const quotaUsed = standQuota?.substitutionsUsed ?? 0
  const quotaExhausted = quotaEnabled && quotaUsed >= quotaLimit

  // Aprovação delegada: interruptor POR EVENTO, default desligado. Quem decide
  // é a organização — a funcionalidade existir não basta para valer em todo
  // evento, porque aprovar é o que dá acesso físico.
  const aprovacaoPeloGestor = eventConfig?.eventConfigs?.standApprovalEnabled === true

  // Miniatura: decripta a biometria server-side (formato novo) ou usa o
  // data URL legado — nunca expõe o payload criptografado ao client
  const withPhotos = participants.map((p) => ({
    id: p.id,
    name: p.name,
    cpf: p.cpf,
    createdAt: p.createdAt,
    approvalStatus: (p.approvalStatus ?? 'pending') as 'pending' | 'approved' | 'rejected',
    photo: tryGetFaceImageDataUrl(p, { participantId: p.id, where: 'app/stand/[token]' }),
    // Mesmo critério do painel do admin (lib/participants/face-risk): fonte
    // única, para gestor e organização não verem classificações diferentes da
    // mesma foto.
    risco: riscoDeFace({
      faceInterocularPx: p.faceInterocularPx,
      faceStatus: deriveFaceStatus(p.faceInterocularPx),
      faceUnvalidated: !!(p.customData as any)?.__faceUnvalidated
    })
  }))

  const precisamRecaptura = withPhotos.filter((p) => p.risco !== null).length

  const count = participants.length
  const lockedCount = lockedSlots.length
  const limit = access.stand.maxRegistrations
  const occupied = count + lockedCount
  const available = Math.max(limit - occupied, 0)
  const pct = limit > 0 ? Math.min((occupied / limit) * 100, 100) : 100
  const isFull = occupied >= limit
  const earliestRelease = lockedSlots[0]?.slotLockedUntil
    ? formatRelease(lockedSlots[0].slotLockedUntil)
    : null

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: NAVY }} className="px-4 py-6">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-3">
          <div>
            <p style={{ color: TEAL }} className="text-sm font-semibold">
              {access.event.name}
            </p>
            <h1 className="text-2xl font-bold text-white mt-1">{access.stand.name}</h1>
            <p className="text-sm text-gray-300 mt-1">
              <code className="bg-white/10 px-2 py-0.5 rounded">{access.stand.code}</code>
              {access.stand.location && <span className="ml-2">{access.stand.location}</span>}
            </p>
          </div>
          <Link
            href={`/stand/${token}/ajuda`}
            className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors whitespace-nowrap"
          >
            ❓ Como funciona
          </Link>
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
                {occupied}
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
          {/* Três estados: ativos · liberando (travados) · disponíveis */}
          <p className="text-sm text-gray-600 mt-3">
            {count} ativo{count !== 1 ? 's' : ''}
            {lockedCount > 0 && earliestRelease && (
              <span className="text-amber-700">
                {' '}· {lockedCount} vaga{lockedCount !== 1 ? 's' : ''} liberando às {earliestRelease}
              </span>
            )}
            {' '}· {available} disponíve{available !== 1 ? 'is' : 'l'}
          </p>
          {isFull && (
            <p className="text-sm text-red-600 font-medium mt-1">
              {lockedCount > 0 && earliestRelease
                ? `Stand sem vagas disponíveis no momento. Próxima liberação: ${earliestRelease}.`
                : 'Stand lotado — para liberar uma vaga, exclua um credenciado.'}
            </p>
          )}
          {quotaEnabled && (
            <p className="text-xs text-gray-500 mt-2">
              Substituições: {quotaUsed} de {quotaLimit}
              {quotaExhausted && ' — cota esgotada; novas trocas devem ser solicitadas à organização'}
            </p>
          )}

          {/* O botão "Cadastrar credenciado" saiu daqui em 2026-09-02.
              Ele apontava para /stand/[token]/cadastro com o MESMO token de
              gestão, e era isso que fazia o link de gestão funcionar como link
              de cadastro: repassá-lo à equipe dava certo, todo mundo se
              inscrevia — e cada pessoa ficava também com a lista completa do
              stand (foto e CPF de todos) e com o botão de excluir.
              Quem cadastra agora é só o link de cadastro, distribuído pela
              organização. Manter o botão aqui seria um beco sem saída: a página
              de cadastro recusa token de gestão. */}
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm text-gray-700">
              <strong>Para cadastrar sua equipe</strong>, use o <em>link de cadastro</em> do stand,
              fornecido pela organização. Ele pode ser repassado a todos que precisam de credencial.
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              Este link, o de gestão, é só seu: acompanha quem já se credenciou e permite excluir.
              Não o compartilhe com a equipe.
            </p>
          </div>
        </section>

        {/* Lista de credenciados */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Credenciados ({count})
          </h2>

          {/* Resumo no topo: com equipes grandes, exigir que o gestor percorra a
              lista inteira para descobrir SE há problema é o mesmo que não
              avisar. O número aparece antes da rolagem. */}
          {precisamRecaptura > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                {precisamRecaptura === 1
                  ? '1 foto precisa ser refeita'
                  : `${precisamRecaptura} fotos precisam ser refeitas`}
              </p>
              <p className="text-sm text-amber-800 mt-1">
                As marcadas abaixo podem não ser reconhecidas na entrada do evento.
                Toque na foto para vê-la inteira e conferir. Para trocar, peça à pessoa
                uma nova captura ou fale com a organização.
              </p>
            </div>
          )}

          {count === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium">Nenhum credenciado cadastrado ainda.</p>
              <p className="text-sm mt-1">
                Compartilhe o <strong>link de cadastro</strong> do stand com sua equipe — não este,
                que é o seu link de gestão.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {withPhotos.map((p) => (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <FotoCredenciado src={p.photo} nome={p.name} risco={p.risco} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-sm text-gray-500">{maskDocument(p.cpf)}</p>
                    {/* O motivo em português de gente, não o rótulo técnico: quem
                        lê isto vai pedir a foto nova à pessoa, não depurar o gate. */}
                    {p.risco === 'nao-validada' && (
                      <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        ⚠ Precisa de foto nova — rosto não confirmado
                      </p>
                    )}
                    {p.risco === 'medida-baixa' && (
                      <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                        ⚠ Foto fraca — rosto ficou pequeno
                      </p>
                    )}
                    {/* Status de aprovação: visível SEMPRE, mesmo com a delegação
                        desligada. Sem isto o gestor não sabe se a pessoa está
                        liberada para entrar, e a primeira notícia seria a catraca
                        fechada no dia. */}
                    <p className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      p.approvalStatus === 'approved' ? 'bg-green-100 text-green-800'
                      : p.approvalStatus === 'rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {p.approvalStatus === 'approved' ? 'Aprovado'
                        : p.approvalStatus === 'rejected' ? 'Rejeitado — não entra no evento'
                        : 'Aguardando aprovação'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-xs text-gray-400 whitespace-nowrap">
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeZone: 'America/Sao_Paulo'
                      }).format(p.createdAt)}
                    </p>
                    {aprovacaoPeloGestor && (
                      <AprovarCredenciadoButton
                        token={token}
                        participantId={p.id}
                        participantName={p.name}
                        status={p.approvalStatus}
                      />
                    )}
                    <RemoveCredenciadoButton
                      token={token}
                      participantId={p.id}
                      participantName={p.name}
                      hasCheckinToday={checkedInIds.has(p.id)}
                      nextResetLabel={nextResetLabel}
                      quotaExhausted={quotaExhausted}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Removidos ────────────────────────────────────────────────────
            Aparecem porque a linha removida é o que BLOQUEIA o CPF de voltar:
            escondê-la fazia a pessoa tomar "CPF já possui cadastro" no balcão
            sem que ninguém conseguisse ver a causa. */}
        {removidos.length > 0 && (
          <section className="bg-white rounded-2xl shadow p-6 mt-6">
            <h2 className="text-lg font-bold text-gray-900">
              Retirados da equipe ({removidos.length})
            </h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Estas pessoas saíram da equipe. O CPF delas continua reservado
              neste evento — se alguma precisar voltar, use “Trazer de volta”.
            </p>
            <ul className="divide-y divide-gray-100">
              {removidos.map((p) => {
                const travado = !!p.slotLockedUntil && p.slotLockedUntil > now
                return (
                  <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 truncate">{p.name}</p>
                      <p className="text-sm text-gray-400">{maskDocument(p.cpf)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Saiu em{' '}
                        {p.removedAt
                          ? new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeZone: 'America/Sao_Paulo'
                            }).format(p.removedAt)
                          : '—'}
                        {' · '}
                        {p.faceData || p.faceImageUrl
                          ? 'foto mantida'
                          : 'precisará de foto nova'}
                      </p>
                    </div>
                    {travado ? (
                      // A regra anti-rotatividade vale também aqui: quem usou a
                      // credencial hoje não volta hoje. Dizer POR QUE evita o
                      // "o botão não funciona".
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-right max-w-[14rem]">
                        Usou a credencial hoje. Liberado a partir de{' '}
                        {formatRelease(p.slotLockedUntil!)}.
                      </p>
                    ) : (
                      // "Reativar" saiu do painel do gestor em 04/09/2026.
                      // Ele NUNCA devolvia acesso: a remoção apaga a biometria,
                      // então a pessoa voltava para a lista sem foto, sem
                      // conseguir entrar, e parecendo pronta na tela — foi o que
                      // aconteceu com 7 pessoas do Expofest em quatro dias.
                      // Com o recadastro funcionando (a linha removida deixou de
                      // bloquear o CPF), o caminho de volta traz foto nova e é o
                      // único que resolve. Reativar segue existindo no painel da
                      // organização, para o caso que precisar dele.
                      <p className="text-xs text-gray-500 text-right max-w-[15rem]">
                        Para voltar à equipe, esta pessoa se cadastra de novo pelo
                        link de cadastro do stand, com uma foto nova.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <p className="text-xs text-gray-400 text-center pb-6">
          Este painel é exclusivo do seu stand. Em caso de dúvidas, contate a
          organização do evento.
        </p>
      </div>
    </main>
  )
}
