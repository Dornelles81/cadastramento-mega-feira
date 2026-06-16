import type { NextApiRequest, NextApiResponse } from 'next'
import Joi from 'joi'
import { prisma } from '../../lib/prisma'
import { encryptString } from '../../lib/crypto'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken } from '../../lib/stand-access/validate'
import { occupiedSlotsWhere, formatRelease } from '../../lib/stand-access/occupancy'

/**
 * Cadastro de credenciado via link mágico do stand (SPEC seção 2.3).
 *
 * O standId vem EXCLUSIVAMENTE da validação server-side do token — nunca do
 * client. A vaga é validada dentro de uma transação com lock pessimista na
 * linha do stand (ADENDO seção 2) para evitar corrida; currentCount é cache
 * derivado, atualizado na mesma transação.
 */

const schema = Joi.object({
  token: Joi.string().required(),
  name: Joi.string().min(2).max(100).required(),
  cpf: Joi.string().required(),
  email: Joi.string().email().allow('', null).optional(),
  phone: Joi.string().min(10).allow('', null).optional(),
  faceImage: Joi.string().allow('', null).optional(),
  faceData: Joi.object().allow(null).optional(),
  consent: Joi.boolean().valid(true).required(),
  customData: Joi.object().optional()
})

function isValidCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')
  if (numbers.length !== 11) return false
  if (/^(\d)\1{10}$/.test(numbers)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(numbers[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(numbers[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(numbers[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  return remainder === parseInt(numbers[10])
}

class StandFullError extends Error {
  // nextRelease ≠ null indica que há slot(s) travado(s) pela regra
  // anti-rotatividade (Fase 7) liberando na próxima virada
  constructor(public nextRelease: Date | null) {
    super('Stand lotado')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!rateLimitOrReject(req, res, 'stand-register', 10, 10 * 60 * 1000)) {
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

    const { token, name, cpf, email, phone, faceImage, faceData, consent, customData } = value

    // Erro genérico para token inválido: não revelar se o stand existe
    const access = await validateStandToken(token)
    if (!access) {
      return res.status(404).json({
        error: 'Invalid link',
        message: 'Link inválido ou expirado. Contate a organização.'
      })
    }
    const standId = access.stand.id

    const event = access.event.id
      ? await prisma.event.findUnique({
          where: { id: access.event.id },
          include: { eventConfigs: true }
        })
      : null
    if (!event) {
      return res.status(400).json({
        error: 'Event not found',
        message: 'Evento do stand não encontrado. Contate a organização.'
      })
    }

    const requireFace = event.eventConfigs?.requireFace !== false
    if (requireFace && !faceImage) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Foto facial é obrigatória para este evento'
      })
    }

    const cleanCPF = cpf.replace(/\D/g, '')
    if (!isValidCPF(cleanCPF)) {
      return res.status(400).json({ error: 'Invalid CPF', message: 'CPF inválido' })
    }

    const existing = await prisma.participant.findFirst({
      where: { cpf: cleanCPF, eventId: event.id },
      select: { id: true }
    })
    if (existing) {
      return res.status(409).json({
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado neste evento'
      })
    }

    // Biometria: criptografa a imagem (AES-256-GCM) — nunca armazenar plaintext
    let encryptedFaceData: Buffer | null = null
    // Medição REAL do detector (MediaPipe); null se o cliente não mediu (legado).
    const faceInterocularPx =
      faceData && typeof faceData.faceInterocularPx === 'number'
        ? faceData.faceInterocularPx
        : null
    if (faceImage) {
      const dataUrl = faceImage.includes(',')
        ? faceImage
        : `data:image/jpeg;base64,${faceImage}`
      encryptedFaceData = encryptString(dataUrl)
    }

    const { documents, ...otherCustomData } = customData || {}

    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '90', 10)
    const retentionDate = new Date(event.endDate)
    retentionDate.setDate(retentionDate.getDate() + retentionDays)

    const ip = getClientIp(req)
    const userAgent = (req.headers['user-agent'] as string) || 'unknown'

    // Transação com lock na linha do stand: valida vaga e grava atomicamente.
    // A contagem usa a definição canônica de ocupação (Fase 7): ativos +
    // slots travados por exclusão com check-in no dia — SEMPRE recontada
    // aqui dentro (o currentCount é só cache de exibição)
    const participant = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`

      const now = new Date()
      const occupied = await tx.participant.count({
        where: occupiedSlotsWhere(standId, now)
      })
      if (occupied >= access.stand.maxRegistrations) {
        // Distinguir lotado real de vaga travada: o responsável precisa
        // entender quando a vaga libera (SPEC Fase 7, seção 4)
        const nextLocked = await tx.participant.findFirst({
          where: {
            standId,
            status: 'removed',
            isDeleted: false,
            slotLockedUntil: { gt: now }
          },
          orderBy: { slotLockedUntil: 'asc' },
          select: { slotLockedUntil: true }
        })
        throw new StandFullError(nextLocked?.slotLockedUntil ?? null)
      }

      const created = await tx.participant.create({
        data: {
          name: name.trim(),
          cpf: cleanCPF,
          email: email || null,
          phone: phone ? phone.replace(/\D/g, '') : '',
          eventId: event.id,
          eventCode: event.code,
          standId,
          faceImageUrl: null,
          faceData: encryptedFaceData,
          faceInterocularPx,
          consentAccepted: consent,
          consentIp: ip,
          consentDate: new Date(),
          retentionDate,
          deviceInfo: userAgent,
          documents: documents || {},
          customData: otherCustomData || {}
        }
      })

      // currentCount é cache de exibição: grava a contagem canônica
      // (ativos + travados) no momento da escrita
      await tx.stand.update({
        where: { id: standId },
        data: { currentCount: occupied + 1 }
      })

      return created
    })

    return res.status(201).json({
      success: true,
      registrationId: participant.id,
      message: 'Cadastro realizado com sucesso',
      participant: {
        id: participant.id,
        name: participant.name,
        registeredAt: participant.createdAt
      }
    })
  } catch (error: any) {
    if (error instanceof StandFullError) {
      if (error.nextRelease) {
        return res.status(409).json({
          error: 'Slots locked',
          message: `Stand sem vagas disponíveis no momento. Próxima liberação: ${formatRelease(error.nextRelease)}.`,
          nextRelease: error.nextRelease
        })
      }
      return res.status(409).json({
        error: 'Stand full',
        message: 'Stand lotado. Para liberar uma vaga, o responsável precisa excluir um credenciado.'
      })
    }
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'CPF already registered',
        message: 'Este CPF já está cadastrado neste evento'
      })
    }
    console.error('Stand registration error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}
