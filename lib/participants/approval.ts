/**
 * Aprovação/rejeição de participante — NÚCLEO ÚNICO.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * A mesma lógica estava copiada em `participant-approval` e
 * `approve-participant`, e uma TERCEIRA variante em `participants.ts` (índice)
 * mudava `approvalStatus` sem disparar o fan-out — quem fosse aprovado por ali
 * ficaria aprovado, sem `employeeNo`, sem linha de sync e invisível nos
 * terminais, porque a reconciliação filtra `employeeNo NOT NULL`. Nenhum
 * participante em produção caiu nisso (verificado em 2026-09-01: 135 aprovados,
 * zero sem identidade), mas o caminho existia.
 *
 * Aprovar NÃO é só mudar um campo: é a transição que dá ACESSO FÍSICO. Ela
 * atribui identidade, empurra a biometria para todos os terminais e precisa
 * ficar registrada. Concentrar isso aqui é o que impede a próxima cópia de
 * esquecer um dos passos.
 *
 * ── O ATOR ────────────────────────────────────────────────────────────────
 * Até 2026-09-01 os três caminhos gravavam a string `'admin'` fixa em
 * `approvedBy`, `approvalLog.adminUser` e `auditLog.adminUser` — o sistema
 * registrava a aprovação e NÃO SABIA QUEM APROVOU, mesmo tendo a sessão em
 * mãos. Agora o ator é obrigatório e tipado.
 *
 * O formato já contempla o responsável de stand porque o `AuditLog` tem
 * `actorType`/`actorIdentifier` desde o fluxo delegado de exclusão, e o
 * `stand-removal` já os usa. Se a aprovação for delegada ao gestor, ele chama
 * esta mesma função — sem uma quarta cópia.
 *
 * Registros anteriores continuam com `'admin'`: não há como saber quem foram. O
 * marco é a data do deploy, e isso é honesto — o sistema não sabia, e passa a
 * saber.
 */
import { prisma } from '../prisma'
import { onBecameEligible, enqueueRemoval } from '../agent/sync-enqueue'

export type AtorAprovacao =
  | { tipo: 'admin'; id?: string | null; email: string; nome?: string | null }
  | { tipo: 'stand_responsible'; email: string; standId: string }

export interface AplicarAprovacaoInput {
  participantId: string
  acao: 'approve' | 'reject'
  ator: AtorAprovacao
  /** Motivo da rejeição (ignorado ao aprovar). */
  motivo?: string | null
  notas?: string | null
  ip?: string | null
}

export interface ResultadoAprovacao {
  participantId: string
  statusAnterior: string
  statusNovo: 'approved' | 'rejected'
  /** false = o fan-out falhou; a aprovação vale, mas o sync precisa de atenção. */
  sincronizado: boolean
}

/** Identificador legível do ator, para os campos de texto livre. */
function identificador(ator: AtorAprovacao): string {
  return ator.email
}

export async function aplicarAprovacao(
  input: AplicarAprovacaoInput
): Promise<ResultadoAprovacao | null> {
  const { participantId, acao, ator, motivo, notas, ip } = input

  const participante = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, name: true, cpf: true, eventId: true, approvalStatus: true }
  })
  if (!participante) return null

  const statusAnterior = participante.approvalStatus ?? 'pending'
  const statusNovo = acao === 'approve' ? 'approved' : 'rejected'
  const agora = new Date()
  const quem = identificador(ator)

  await prisma.participant.update({
    where: { id: participantId },
    data: {
      approvalStatus: statusNovo,
      approvedAt: acao === 'approve' ? agora : null,
      // Quem de fato aprovou, não mais a string 'admin'.
      approvedBy: acao === 'approve' ? quem : null,
      rejectionReason: acao === 'reject' ? (motivo ?? null) : null
    }
  })

  // Transição de elegibilidade. Não-fatal de propósito: a decisão do operador
  // já foi tomada e gravada; uma falha de fan-out não pode desfazê-la. Mas o
  // resultado diz que houve falha, em vez de engolir.
  let sincronizado = true
  try {
    if (acao === 'approve') {
      await onBecameEligible(participante.eventId, participantId)
    } else {
      await enqueueRemoval(participantId)
    }
  } catch (e) {
    sincronizado = false
    console.error(`[aprovacao] fan-out falhou (${acao}, ${participantId}):`, e)
  }

  // `adminId` é FK para EventAdmin. Um id que não exista lá viola a constraint
  // e derruba a gravação do log — perdendo exatamente o registro de autoria que
  // esta função existe para salvar. Confere antes e, se não existir, grava só o
  // e-mail: identidade preservada, log preservado.
  const ehAdmin = ator.tipo === 'admin'
  let adminId: string | null = null
  if (ehAdmin && ator.id) {
    const existe = await prisma.eventAdmin.findUnique({
      where: { id: ator.id },
      select: { id: true }
    }).catch(() => null)
    if (existe) adminId = existe.id
    else console.warn(`[aprovacao] adminId "${ator.id}" não existe em EventAdmin; log fica só com o e-mail`)
  }

  // Logs não-bloqueantes: perder o registro é ruim, perder a operação é pior.
  try {
    await prisma.approvalLog.create({
      data: {
        participantId,
        action: statusNovo,
        previousStatus: statusAnterior,
        newStatus: statusNovo,
        reason: motivo ?? null,
        notes: notas ?? null,
        adminId,
        adminUser: quem,   // campo legado, mantido preenchido para não regredir leituras
        adminEmail: ator.email,
        adminIp: ip ?? null
      }
    })
  } catch (e: any) {
    console.warn('[aprovacao] approvalLog falhou:', e?.message)
  }

  try {
    await prisma.auditLog.create({
      data: {
        action: acao.toUpperCase(),
        entityType: 'participant',
        entityId: participantId,
        // actorType/actorIdentifier: os mesmos campos que o fluxo delegado de
        // exclusão já usa. É o que permite distinguir organização de gestor.
        actorType: ator.tipo,
        actorIdentifier: quem,
        targetParticipantId: participantId,
        adminId,
        adminUser: quem,
        adminEmail: ator.email,
        adminIp: ip ?? null,
        previousData: { approvalStatus: statusAnterior },
        newData: { approvalStatus: statusNovo },
        description:
          `Participante ${participante.name} (${participante.cpf}) foi ${statusNovo} por ${quem}` +
          (ator.tipo === 'stand_responsible' ? ' (responsável do stand)' : ''),
        metadata: { reason: motivo ?? null, notes: notas ?? null, sincronizado },
        severity: 'INFO'
      }
    })
  } catch (e: any) {
    console.warn('[aprovacao] auditLog falhou:', e?.message)
  }

  return { participantId, statusAnterior, statusNovo, sincronizado }
}

/** Monta o ator a partir da sessão de admin do NextAuth. */
export function atorDaSessao(session: any): AtorAprovacao {
  const u = session?.user ?? {}
  return {
    tipo: 'admin',
    id: u.id ?? null,
    // Sem e-mail na sessão o registro ficaria anônimo de novo; o fallback deixa
    // isso VISÍVEL no log em vez de virar mais um 'admin' silencioso.
    email: u.email ?? '(sessao-sem-email)',
    nome: u.name ?? null
  }
}
