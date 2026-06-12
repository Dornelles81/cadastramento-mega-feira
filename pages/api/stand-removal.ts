import type { NextApiRequest, NextApiResponse } from 'next'
import Joi from 'joi'
import { prisma } from '../../lib/prisma'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken, maskDocument } from '../../lib/stand-access/validate'
import {
  SENSITIVE_PARTICIPANT_CLEAR,
  extractUploadRefs,
  deleteUploadFiles
} from '../../lib/participant-sensitive'
import { removeUserFromDevice } from '../../lib/ivms'

/**
 * Exclusão de credenciado pelo responsável do stand (SPEC seção 2.4).
 *
 * - Token revalidado no servidor; o credenciado precisa pertencer ao stand
 *   do token e estar ativo.
 * - Em transação: status='removed' + limpeza da biometria/documentos (mesmo
 *   conjunto do expurgo LGPD) + audit log imutável + currentCount recalculado.
 * - Remoção no dispositivo: tentativa imediata via ISAPI; se falhar (ex.:
 *   dispositivo fora da rede, caso normal em produção), fica na fila
 *   `pendingDeviceRemoval` para o sync local reprocessar, sem bloquear.
 */

const schema = Joi.object({
  token: Joi.string().required(),
  participantId: Joi.string().uuid().required(),
  reason: Joi.string().max(500).allow('', null).optional()
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!rateLimitOrReject(req, res, 'stand-removal', 20, 10 * 60 * 1000)) {
    return
  }

  try {
    const { error, value } = schema.validate(req.body)
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message
      })
    }
    const { token, participantId, reason } = value

    const access = await validateStandToken(token)
    if (!access) {
      return res.status(404).json({
        error: 'Invalid link',
        message: 'Link inválido ou expirado. Contate a organização.'
      })
    }
    const standId = access.stand.id

    // O credenciado precisa pertencer ao stand do token e estar ativo —
    // nunca confiar no client (SPEC 2.4)
    const participant = await prisma.participant.findFirst({
      where: { id: participantId, standId, status: 'active', isDeleted: false },
      select: {
        id: true,
        name: true,
        cpf: true,
        createdAt: true,
        documents: true,
        customData: true
      }
    })
    if (!participant) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Credenciado não encontrado neste stand ou já removido.'
      })
    }

    const ip = getClientIp(req)
    const userAgent = (req.headers['user-agent'] as string) ?? null
    const responsibleEmail = access.stand.responsibleEmail?.trim()
    const removedBy = responsibleEmail?.includes('@') ? responsibleEmail : 'responsavel-stand'

    // Snapshot NÃO-sensível para a auditoria (nunca biometria)
    const snapshot = {
      name: participant.name,
      document: maskDocument(participant.cpf),
      registeredAt: participant.createdAt.toISOString()
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`

      await tx.participant.update({
        where: { id: participant.id },
        data: {
          status: 'removed',
          removedAt: new Date(),
          removedBy,
          // LGPD: dado sensível não persiste após exclusão (mesmo conjunto
          // do expurgo automático)
          ...SENSITIVE_PARTICIPANT_CLEAR,
          // Fila de remoção no dispositivo (ADENDO seção 4)
          pendingDeviceRemoval: true
        }
      })

      const active = await tx.participant.count({
        where: { standId, status: 'active', isDeleted: false }
      })
      await tx.stand.update({
        where: { id: standId },
        data: { currentCount: active }
      })

      await tx.auditLog.create({
        data: {
          eventId: access.event.id,
          standId,
          action: 'PARTICIPANT_REMOVED',
          entityType: 'participant',
          entityId: participant.id,
          actorType: 'stand_responsible',
          actorIdentifier: removedBy,
          targetParticipantId: participant.id,
          targetSnapshot: snapshot,
          reason: reason || null,
          ip,
          userAgent,
          description: `Credenciado removido do stand ${access.stand.code} pelo responsável`,
          severity: 'INFO'
        }
      })
    })

    // Arquivos físicos referenciados morrem junto com a referência; falha
    // não bloqueia a exclusão, mas fica registrada para reprocessamento
    const fileRefs = extractUploadRefs(participant.documents, participant.customData)
    const { failed: filesFailed } = await deleteUploadFiles(fileRefs)
    if (filesFailed.length > 0) {
      await prisma.auditLog.create({
        data: {
          eventId: access.event.id,
          standId,
          action: 'UPLOAD_PURGE_FAILED',
          entityType: 'participant',
          entityId: participant.id,
          actorType: 'stand_responsible',
          actorIdentifier: removedBy,
          description: 'Falha ao apagar arquivo físico de upload na exclusão — reprocessar',
          metadata: { files: filesFailed },
          severity: 'WARNING'
        }
      })
    }

    // Tentativa imediata de remover do dispositivo (fora da transação:
    // falha remota não pode desfazer a exclusão no sistema)
    const removedFromDevice = await removeUserFromDevice(participant.cpf)
    if (removedFromDevice) {
      await prisma.participant.update({
        where: { id: participant.id },
        data: { pendingDeviceRemoval: false }
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Credenciado removido. A vaga foi liberada.',
      deviceRemoval: removedFromDevice ? 'done' : 'queued'
    })
  } catch (error: any) {
    console.error('Stand removal error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  }
}
