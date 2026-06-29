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
import { enqueueRemoval } from '../../lib/agent/sync-enqueue'
import {
  lastDayReset,
  nextDayReset,
  occupiedSlotsWhere,
  formatRelease
} from '../../lib/stand-access/occupancy'

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

class QuotaExceededError extends Error {
  constructor(public quotaLimit: number) {
    super('Cota de substituições esgotada')
  }
}

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

    // Enforcement de permissão (Fatia 3): só o link de gestão ('manage')
    // pode excluir. O link de cadastro ('register') é compartilhável com a
    // equipe e nunca exclui. Gate vem ANTES de qualquer leitura/escrita.
    if (access.scope !== 'manage') {
      return res.status(403).json({
        error: 'Forbidden',
        message:
          'Este link permite apenas cadastro. A exclusão é restrita ao responsável do stand.'
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

    // Fase 7: configuração do dia operacional e da cota de substituições
    const event = access.event.id
      ? await prisma.event.findUnique({
          where: { id: access.event.id },
          select: {
            dayResetHour: true,
            startDate: true,
            substitutionQuotaEnabled: true,
            substitutionsPerSlot: true
          }
        })
      : null
    const dayResetHour = event?.dayResetHour ?? 4
    const now = new Date()
    const sinceReset = lastDayReset(dayResetHour, now)

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`

      // Cota de substituições (módulo opcional, Fase 7): exclusões antes do
      // início do evento são livres (montagem de equipe); durante o evento
      // consomem cota e, esgotada, o painel bloqueia (admin segue podendo)
      const quotaActive =
        !!event?.substitutionQuotaEnabled && now >= new Date(event.startDate)
      if (quotaActive) {
        const standRow = await tx.stand.findUnique({
          where: { id: standId },
          select: { substitutionsUsed: true, maxRegistrations: true }
        })
        const quotaLimit =
          (standRow?.maxRegistrations ?? 0) * (event!.substitutionsPerSlot ?? 1)
        if ((standRow?.substitutionsUsed ?? 0) >= quotaLimit) {
          throw new QuotaExceededError(quotaLimit)
        }
      }

      // Regra de ouro: vaga usada no dia não pode ser reutilizada no mesmo
      // dia. Check-in no dia operacional corrente → o SLOT fica travado até
      // a próxima virada (a pessoa perde o acesso físico imediatamente)
      const checkinToday = await tx.accessLog.findFirst({
        where: {
          participantId: participant.id,
          type: 'ENTRY',
          createdAt: { gte: sinceReset }
        },
        select: { id: true }
      })
      const hadCheckinToday = !!checkinToday
      const slotLockedUntil = hadCheckinToday ? nextDayReset(dayResetHour, now) : null

      await tx.participant.update({
        where: { id: participant.id },
        data: {
          status: 'removed',
          removedAt: now,
          removedBy,
          slotLockedUntil,
          // LGPD: dado sensível não persiste após exclusão (mesmo conjunto
          // do expurgo automático)
          ...SENSITIVE_PARTICIPANT_CLEAR,
          // Fila de remoção no dispositivo (ADENDO seção 4)
          pendingDeviceRemoval: true
        }
      })

      // currentCount = cache de exibição; grava a contagem canônica
      // (ativos + slots travados) no momento da escrita
      const occupied = await tx.participant.count({
        where: occupiedSlotsWhere(standId, now)
      })
      const standData: any = { currentCount: occupied }
      if (quotaActive) standData.substitutionsUsed = { increment: 1 }
      await tx.stand.update({ where: { id: standId }, data: standData })

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
          targetSnapshot: {
            name: participant.name,
            document: maskDocument(participant.cpf),
            registeredAt: participant.createdAt.toISOString(),
            // Fase 7: rastro da regra anti-rotatividade
            hadCheckinToday,
            ...(slotLockedUntil ? { slotLockedUntil: slotLockedUntil.toISOString() } : {})
          },
          reason: reason || null,
          ip,
          userAgent,
          description: `Credenciado removido do stand ${access.stand.code} pelo responsável`,
          severity: 'INFO'
        }
      })

      if (quotaActive) {
        await tx.auditLog.create({
          data: {
            eventId: access.event.id,
            standId,
            action: 'SUBSTITUTION_QUOTA_CONSUMED',
            entityType: 'stand',
            entityId: standId,
            actorType: 'stand_responsible',
            actorIdentifier: removedBy,
            targetParticipantId: participant.id,
            ip,
            userAgent,
            description: `Substituição consumida da cota do stand ${access.stand.code}`,
            severity: 'INFO'
          }
        })
      }

      return { hadCheckinToday, slotLockedUntil }
    })

    // Removido do stand (status='removed') → enfileira remoção do device em cada
    // terminal (o agente faz deleteUser). As linhas de sync persistem (não é
    // delete hard). Idempotente e não-fatal.
    try {
      await enqueueRemoval(participant.id)
    } catch (syncErr) {
      console.error('enqueueRemoval falhou na remoção de stand:', syncErr)
    }

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
      message: result.slotLockedUntil
        ? `Credenciado removido. Como ele já acessou o evento hoje, a vaga só estará disponível para novo cadastro a partir das ${formatRelease(result.slotLockedUntil)}.`
        : 'Credenciado removido. A vaga foi liberada.',
      hadCheckinToday: result.hadCheckinToday,
      slotLockedUntil: result.slotLockedUntil,
      deviceRemoval: removedFromDevice ? 'done' : 'queued'
    })
  } catch (error: any) {
    if (error instanceof QuotaExceededError) {
      return res.status(403).json({
        error: 'Quota exceeded',
        message: `A cota de substituições do stand foi atingida (${error.quotaLimit}). Novas trocas devem ser solicitadas à organização do evento.`
      })
    }
    console.error('Stand removal error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  }
}
