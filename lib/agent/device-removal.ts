/**
 * Fila de remoção no device que SOBREVIVE ao hard delete do participante.
 *
 * Por que existe: `ParticipantTerminalSync` tem `onDelete: Cascade` para
 * `Participant`. Ao apagar o participante, o banco apaga junto a linha que
 * serviria para enfileirar a remoção — destrói-se o instrumento antes de usá-lo.
 * O painel confirma a exclusão e o rosto continua no terminal.
 *
 * A regra é uma só: **gravar a pendência ANTES do delete**. Depois é tarde; o
 * `employeeNo` já não pode mais ser descoberto a partir do banco.
 */
import { prisma } from '../prisma'

export interface RemocaoEnfileirada {
  employeeNo: string
  terminalIds: string[]
}

/**
 * Enfileira a remoção do participante em TODOS os terminais onde ele tem (ou
 * teve) linha de sync — que é a lista exata de devices onde ele pode estar
 * gravado.
 *
 * CHAMAR ANTES de `prisma.participant.delete()`. Idempotente: repetir o pedido
 * não duplica (upsert na chave `[employeeNo, terminalId]`) e reabre uma
 * pendência já concluída, caso a pessoa tenha voltado ao device por algum
 * caminho.
 *
 * Sem `employeeNo` não há o que remover: quem nunca recebeu identidade nunca
 * chegou a device nenhum.
 */
export async function enqueueDeviceRemovalBeforeDelete(
  participantId: string
): Promise<RemocaoEnfileirada | null> {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { employeeNo: true }
  })
  if (!p?.employeeNo) return null

  const linhas = await prisma.participantTerminalSync.findMany({
    where: { participantId },
    select: { terminalId: true }
  })
  const terminalIds = [...new Set(linhas.map((l) => l.terminalId))]
  if (terminalIds.length === 0) return null

  for (const terminalId of terminalIds) {
    await prisma.pendingDeviceRemoval.upsert({
      where: { employeeNo_terminalId: { employeeNo: p.employeeNo, terminalId } },
      create: { employeeNo: p.employeeNo, terminalId },
      // Reabre: novo pedido zera a confirmação e o histórico de tentativas.
      update: { removedAt: null, attempts: 0, lastError: null, requestedAt: new Date() }
    })
  }

  return { employeeNo: p.employeeNo, terminalIds }
}
