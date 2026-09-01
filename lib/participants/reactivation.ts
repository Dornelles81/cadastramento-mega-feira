/**
 * Reativação de credenciado removido — NÚCLEO ÚNICO (gestor e admin).
 *
 * ── O problema que resolve ────────────────────────────────────────────────
 * A constraint é `@@unique([eventId, cpf])` e as validações de cadastro não
 * filtram `status`. Quem foi removido toma 409 ao tentar se recadastrar no
 * MESMO evento — e a linha que bloqueia é invisível no painel, que esconde
 * removidos. No balcão da feira isso trava a pessoa, e até 2026-09-01 só se
 * resolvia mexendo no banco.
 *
 * ── O que reativar É, e o que NÃO é ───────────────────────────────────────
 * NÃO é restaurar o cadastro: a remoção APAGA `faceData`, `documents`,
 * `customData` e os arquivos de upload (LGPD — `SENSITIVE_PARTICIPANT_CLEAR`).
 * Confirmado nos 16 removidos em produção: todos sem face e sem documentos.
 * Não existe cadastro para "voltar".
 *
 * Reativar devolve a pessoa à EQUIPE: a linha volta a `active`, volta a ocupar
 * vaga e volta a aparecer no painel. Ela continua SEM biometria, portanto
 * INELEGÍVEL — não vai para os terminais e não abre porta nenhuma até tirar
 * foto nova. Isso é a garantia de que reativar não devolve acesso físico por
 * si só: o acesso volta pela foto, que passa pelo gate atual.
 *
 * ── Por que só gestor e admin ─────────────────────────────────────────────
 * Remover tem INTENÇÃO, e custo: consome cota de substituição, pode travar a
 * vaga até a virada do dia e tira a pessoa do device. Deixar o fluxo público
 * reativar sozinho permitiria que alguém tirado da equipe voltasse por conta
 * própria, revertendo a decisão de quem a tomou. Quem removeu é quem desfaz.
 */
import { prisma } from '../prisma'
import { lastDayReset } from '../stand-access/occupancy'
import { occupiedSlotsWhere } from '../stand-access/occupancy'

export type AtorReativacao =
  | { tipo: 'stand_responsible'; email: string }
  | { tipo: 'admin'; email: string }

export type FalhaReativacao =
  | 'nao-encontrado'
  | 'nao-removido'
  | 'vaga-travada'
  | 'stand-cheio'

export interface ResultadoReativacao {
  ok: boolean
  falha?: FalhaReativacao
  /** Preenchido em 'vaga-travada': quando o slot libera. */
  liberaEm?: Date
  /** A cota de substituição foi devolvida ao stand? */
  cotaDevolvida?: boolean
  participante?: { id: string; name: string; temFoto: boolean }
}

/**
 * Reativa um credenciado removido.
 *
 * `standIdEsperado` é o escopo do chamador: o gestor só reativa quem é do
 * stand DELE. O admin passa `null` e alcança qualquer um — é o escape para
 * quando o gestor está inacessível durante a feira.
 */
export async function reativarParticipante(opts: {
  participantId: string
  standIdEsperado: string | null
  ator: AtorReativacao
  ip?: string | null
  userAgent?: string | null
}): Promise<ResultadoReativacao> {
  const { participantId, standIdEsperado, ator, ip, userAgent } = opts
  const agora = new Date()

  const p = await prisma.participant.findFirst({
    where: {
      id: participantId,
      ...(standIdEsperado ? { standId: standIdEsperado } : {}),
      isDeleted: false
    },
    select: {
      id: true, name: true, status: true, standId: true, eventId: true,
      removedAt: true, slotLockedUntil: true, faceData: true, faceImageUrl: true
    }
  })
  if (!p) return { ok: false, falha: 'nao-encontrado' }
  if (p.status !== 'removed') return { ok: false, falha: 'nao-removido' }

  // slotLockedUntil RESPEITADO. A regra anti-rotatividade existe para impedir
  // que uma credencial sirva a duas pessoas no mesmo dia; reativar não pode ser
  // a porta dos fundos dela.
  if (p.slotLockedUntil && p.slotLockedUntil > agora) {
    return { ok: false, falha: 'vaga-travada', liberaEm: p.slotLockedUntil }
  }

  const evento = p.eventId
    ? await prisma.event.findUnique({
        where: { id: p.eventId },
        select: {
          dayResetHour: true, startDate: true,
          substitutionQuotaEnabled: true, substitutionsPerSlot: true
        }
      })
    : null
  const dayResetHour = evento?.dayResetHour ?? 4

  // A cota volta SÓ se a reativação acontecer na MESMA janela do dia
  // operacional em que a remoção ocorreu. Não devolver nunca puniria quem
  // corrige um engano; devolver sempre transformaria a cota em sugestão —
  // bastaria remover e reativar para zerar o contador. A janela distingue
  // "errei agora" de "estou burlando".
  const inicioDaJanela = lastDayReset(dayResetHour, agora)
  const cotaAtiva =
    !!evento?.substitutionQuotaEnabled && !!evento && agora >= new Date(evento.startDate)
  const mesmaJanela = !!p.removedAt && p.removedAt >= inicioDaJanela
  const devolverCota = cotaAtiva && mesmaJanela

  try {
    await prisma.$transaction(async (tx) => {
      if (p.standId) {
        // Mesmo lock da remoção e do cadastro: reativar OCUPA vaga, então
        // precisa da mesma serialização, senão duas reativações simultâneas
        // furam o limite do stand.
        await tx.$queryRaw`SELECT id FROM stands WHERE id = ${p.standId} FOR UPDATE`

        const stand = await tx.stand.findUnique({
          where: { id: p.standId },
          select: { maxRegistrations: true, substitutionsUsed: true }
        })
        const ocupadas = await tx.participant.count({
          where: occupiedSlotsWhere(p.standId, agora)
        })
        if (stand && ocupadas >= stand.maxRegistrations) {
          throw new StandCheioError()
        }

        const dadosStand: any = {}
        if (devolverCota && (stand?.substitutionsUsed ?? 0) > 0) {
          dadosStand.substitutionsUsed = { decrement: 1 }
        }
        // currentCount recontado DEPOIS do update do participante, abaixo.
        if (Object.keys(dadosStand).length) {
          await tx.stand.update({ where: { id: p.standId }, data: dadosStand })
        }
      }

      await tx.participant.update({
        where: { id: participantId },
        data: {
          status: 'active',
          removedAt: null,
          removedBy: null,
          // A pessoa volta à equipe; nada a remover no device (ela já saiu de
          // lá, e sem face não volta).
          pendingDeviceRemoval: false,
          slotLockedUntil: null
        }
      })

      if (p.standId) {
        const ocupadasDepois = await tx.participant.count({
          where: occupiedSlotsWhere(p.standId, agora)
        })
        await tx.stand.update({
          where: { id: p.standId },
          data: { currentCount: ocupadasDepois }
        })
      }

      await tx.auditLog.create({
        data: {
          eventId: p.eventId,
          standId: p.standId,
          action: 'PARTICIPANT_REACTIVATED',
          entityType: 'participant',
          entityId: participantId,
          actorType: ator.tipo,
          actorIdentifier: ator.email,
          targetParticipantId: participantId,
          // Sem CPF nem dado pessoal além do nome: o mesmo recorte que o
          // targetSnapshot da remoção já usa.
          targetSnapshot: {
            name: p.name,
            removedAt: p.removedAt?.toISOString() ?? null,
            cotaDevolvida: devolverCota
          },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          description:
            `Credenciado ${p.name} reativado por ${ator.email}` +
            (devolverCota ? ' (cota de substituição devolvida)' : ''),
          severity: 'INFO'
        }
      })
    })
  } catch (e) {
    if (e instanceof StandCheioError) return { ok: false, falha: 'stand-cheio' }
    throw e
  }

  return {
    ok: true,
    cotaDevolvida: devolverCota,
    participante: {
      id: p.id,
      name: p.name,
      // Sem foto a pessoa NÃO é elegível: volta à equipe, mas não ao terminal.
      // Quem reativa precisa saber que falta esse passo.
      temFoto: p.faceData != null || p.faceImageUrl != null
    }
  }
}

class StandCheioError extends Error {}
