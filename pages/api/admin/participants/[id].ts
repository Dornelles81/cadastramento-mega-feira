import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../lib/prisma'
import { enqueueDeviceRemovalBeforeDelete } from '../../../../lib/agent/device-removal'
import { withApiAuth, ADMIN_ROLES } from '../../../../lib/api-auth'
import { atorDaSessao } from '../../../../lib/participants/approval'

/**
 * LGPD — snapshot de participante para o audit log, SEM o dado sensível.
 *
 * `previousData`/`newData` guardam a linha inteira do participante, e a linha
 * inteira inclui a biometria. Uma cópia cifrada da face dentro de `audit_logs`
 * SOBREVIVE à exclusão do participante: em 22/08/2026 havia 20 MB de biometria
 * de 134 pessoas que já não existiam mais na tabela `participants` — a exclusão
 * apagou o cadastro e deixou o rosto.
 *
 * Esta função existe para que a regra tenha UM lugar só. A correção original
 * foi aplicada apenas no `handleDelete`, e o `handleUpdate` — no mesmo arquivo,
 * 50 linhas acima — continuou gravando a face por mais um ano, em DUAS cópias
 * por edição (`previousData` e `newData`). Duas cópias da regra foi exatamente
 * o que permitiu consertar uma e esquecer a outra.
 *
 * O que fica: todo o resto — nome, CPF, contato, evento, stand, estados,
 * carimbos. A trilha de auditoria continua respondendo quem mudou o quê e
 * quando. O que sai: só o que não pode sobreviver a um pedido de exclusão.
 */
function snapshotSemBiometria<T extends Record<string, any>>(participante: T): Partial<T> {
  const snapshot: any = { ...participante }
  delete snapshot.faceData
  delete snapshot.faceImageUrl
  delete snapshot.documents
  return snapshot
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid participant ID' })
  }

  // Get admin IP
  const adminIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown'

  // ── QUEM FEZ ──────────────────────────────────────────────────────────────
  // Os INSERTs de auditoria daqui gravavam a string literal 'admin' no campo
  // `adminUser`, e não o ator da sessão. O efeito: 113 exclusões de participante
  // registradas até 04/09/2026 sem autoria — o log dizia que "admin" excluiu,
  // e não havia como saber quem. A `description` ainda carrega o CPF de quem
  // foi excluído, então era o pior dos dois mundos: identifica a vítima e não
  // o autor. Mesmo defeito que já havia sido corrigido em approve-participant.
  //
  // `atorDaSessao` é o helper que os outros caminhos usam; o fallback dele é
  // '(sessao-sem-email)', que deixa a falha VISÍVEL no log em vez de virar mais
  // um 'admin' silencioso.
  const adminUser = atorDaSessao(session).email

  switch (req.method) {
    case 'GET':
      return handleGet(id, res)
    case 'PUT':
      return handleUpdate(id, req.body, adminIp, adminUser, res)
    case 'DELETE':
      return handleDelete(id, adminIp, adminUser, res)
    default:
      return res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(id: string, res: NextApiResponse) {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    return res.status(200).json({ participant })
  } catch (error) {
    console.error('Error fetching participant:', error)
    return res.status(500).json({ error: 'Failed to fetch participant' })
  }
}

async function handleUpdate(id: string, data: any, adminIp: string, adminUser: string, res: NextApiResponse) {
  try {
    // Get the current participant data
    const currentParticipant = await prisma.participant.findUnique({
      where: { id }
    })

    if (!currentParticipant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // Update the participant
    const updatedParticipant = await prisma.participant.update({
      where: { id },
      data: {
        name: data.name,
        cpf: data.cpf,
        email: data.email,
        phone: data.phone,
        eventCode: data.eventCode,
        customData: data.customData,
        standId: data.standId !== undefined ? data.standId : undefined
      }
    })

    // Calculate what changed
    const changes: Record<string, { old: any, new: any }> = {}
    const fieldsToCheck = ['name', 'cpf', 'email', 'phone', 'eventCode']
    
    for (const field of fieldsToCheck) {
      if (currentParticipant[field as keyof typeof currentParticipant] !== data[field]) {
        changes[field] = {
          old: currentParticipant[field as keyof typeof currentParticipant],
          new: data[field]
        }
      }
    }

    // Try to create audit log, but don't fail if it doesn't work
    try {
      // Check if auditLog table exists
      const auditLogExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'audit_logs'
        ) as exists
      ` as any[]
      
      if (auditLogExists && auditLogExists[0]?.exists) {
        // Use raw query to insert audit log
        await prisma.$executeRaw`
          INSERT INTO audit_logs (
            id, action, "entityType", "entityId", "adminUser", "adminIp", 
            "previousData", "newData", changes, description, "createdAt"
          ) VALUES (
            gen_random_uuid(),
            'UPDATE',
            'participant',
            ${id},
            ${adminUser},
            ${adminIp},
            ${JSON.stringify(snapshotSemBiometria(currentParticipant))}::jsonb,
            ${JSON.stringify(snapshotSemBiometria(updatedParticipant))}::jsonb,
            ${JSON.stringify(changes)}::jsonb,
            ${`Participante ${currentParticipant.name} foi editado`},
            NOW()
          )
        `
      }
    } catch (logError) {
      console.log('Audit log not available yet:', logError)
      // Continue without logging
    }

    return res.status(200).json({ 
      success: true,
      participant: updatedParticipant,
      message: 'Participante atualizado com sucesso'
    })
  } catch (error) {
    console.error('Error updating participant:', error)
    return res.status(500).json({ error: 'Failed to update participant' })
  }
}

async function handleDelete(id: string, adminIp: string, adminUser: string, res: NextApiResponse) {
  try {
    // Get the participant data before deleting
    const participant = await prisma.participant.findUnique({
      where: { id }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // LGPD: NUNCA guardar cópia do dado sensível no audit log — ver
    // `snapshotSemBiometria`, que é a mesma regra usada no handleUpdate.
    const auditSnapshot = snapshotSemBiometria(participant)

    // Try to create audit log, but don't fail if it doesn't work
    try {
      // Check if auditLog table exists
      const auditLogExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'audit_logs'
        ) as exists
      ` as any[]

      if (auditLogExists && auditLogExists[0]?.exists) {
        // Use raw query to insert audit log
        await prisma.$executeRaw`
          INSERT INTO audit_logs (
            id, action, "entityType", "entityId", "adminUser", "adminIp",
            "previousData", "newData", description, metadata, "createdAt"
          ) VALUES (
            gen_random_uuid(),
            'DELETE',
            'participant',
            ${id},
            ${adminUser},
            ${adminIp},
            ${JSON.stringify(auditSnapshot)}::jsonb,
            NULL,
            ${`Participante ${participant.name} (CPF: ${participant.cpf}) foi excluído`},
            ${JSON.stringify({
              deletedAt: new Date().toISOString(),
              name: participant.name,
              cpf: participant.cpf,
              email: participant.email,
              phone: participant.phone,
              eventCode: participant.eventCode
            })}::jsonb,
            NOW()
          )
        `
      }
    } catch (logError) {
      console.log('Audit log not available yet:', logError)
      // Continue without logging
    }

    // LGPD — ORDEM CRÍTICA: enfileirar a remoção no device ANTES do delete.
    // ParticipantTerminalSync tem onDelete: Cascade; apagar o participante
    // primeiro destrói a linha que serviria para remover a face do terminal, e
    // a biometria ficaria lá depois de o painel confirmar a exclusão. A fila
    // PendingDeviceRemoval não referencia Participant justamente para
    // sobreviver a este delete.
    let remocaoDevice: Awaited<ReturnType<typeof enqueueDeviceRemovalBeforeDelete>> = null
    try {
      remocaoDevice = await enqueueDeviceRemovalBeforeDelete(id)
    } catch (removalErr) {
      // Não conseguimos garantir a limpeza do device: ABORTA o delete. Melhor o
      // admin tentar de novo do que apagar o registro e deixar o rosto na
      // catraca sem nenhum rastro de quem remover.
      console.error('Falha ao enfileirar remoção no device; delete abortado:', removalErr)
      return res.status(503).json({
        error: 'Não foi possível agendar a remoção da biometria nos terminais. Exclusão cancelada — tente novamente.'
      })
    }

    // Delete related records first to avoid foreign key constraint violations
    try {
      // Delete HikCentral sync logs
      await prisma.hikCentralSyncLog.deleteMany({
        where: { participantId: id }
      })

      // Delete approval logs
      await prisma.approvalLog.deleteMany({
        where: { participantId: id }
      })
    } catch (relatedError) {
      console.log('Error deleting related records:', relatedError)
      // Continue - tables might not exist yet
    }

    // Delete the participant
    await prisma.participant.delete({
      where: { id }
    })

    return res.status(200).json({
      success: true,
      message: 'Participante excluído com sucesso'
    })
  } catch (error) {
    console.error('Error deleting participant:', error)
    return res.status(500).json({ error: 'Failed to delete participant' })
  }
}
export default withApiAuth(handler, { roles: ADMIN_ROLES })
