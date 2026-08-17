/**
 * Quem excluiu um credenciado, e quando — para o badge do painel.
 *
 * SOMENTE LEITURA e apresentação. Não é a "função de domínio de exclusão"
 * (Opção C, adiada): aqui nada é escrito, nada é apagado, nenhum caminho de
 * exclusão é unificado.
 *
 * Fonte: o audit log `PARTICIPANT_REMOVED`, que é imutável e registra o ator
 * real (`actorIdentifier` = e-mail do responsável do stand). `removedAt`/
 * `removedBy` na própria linha do participante são cópias denormalizadas e
 * servem de fallback para registros anteriores ao audit estruturado.
 *
 * Por que isso importa: sem o badge, filtrar os removidos esconde a CAUSA de o
 * CPF continuar bloqueado para recadastro. O admin precisa ver "excluído em X
 * por Y" para decidir entre reativar, apagar de vez ou orientar o gestor.
 */
import { prisma } from '../prisma'

export interface RemocaoInfo {
  /** ISO da exclusão (audit log; fallback removedAt) */
  at: string | null
  /** e-mail/identificador do ator (audit log; fallback removedBy) */
  by: string | null
}

/**
 * Busca a exclusão mais recente de cada participante da lista. Uma query só
 * para a página inteira — nunca N+1. Lista vazia devolve mapa vazio sem tocar
 * no banco.
 */
export async function buscarRemocoes(
  participantIds: string[]
): Promise<Map<string, RemocaoInfo>> {
  const porParticipante = new Map<string, RemocaoInfo>()
  if (participantIds.length === 0) return porParticipante

  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'PARTICIPANT_REMOVED',
      OR: [
        { entityId: { in: participantIds } },
        { targetParticipantId: { in: participantIds } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    select: {
      entityId: true,
      targetParticipantId: true,
      actorIdentifier: true,
      createdAt: true
    }
  })

  for (const log of logs) {
    const pid = log.targetParticipantId ?? log.entityId
    // orderBy desc + primeiro a gravar vence = fica a exclusão mais recente
    if (pid && !porParticipante.has(pid)) {
      porParticipante.set(pid, {
        at: log.createdAt.toISOString(),
        by: log.actorIdentifier
      })
    }
  }
  return porParticipante
}

/** Combina o audit log com os campos denormalizados da própria linha. */
export function montarRemocao(
  participante: { id: string; removedAt: Date | null; removedBy: string | null },
  doAudit: Map<string, RemocaoInfo>
): RemocaoInfo {
  const log = doAudit.get(participante.id)
  return {
    at: log?.at ?? participante.removedAt?.toISOString() ?? null,
    by: log?.by ?? participante.removedBy ?? null
  }
}
