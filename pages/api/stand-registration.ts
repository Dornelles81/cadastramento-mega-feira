import type { NextApiRequest, NextApiResponse } from 'next'
import Joi from 'joi'
import { prisma } from '../../lib/prisma'
import { encryptString } from '../../lib/crypto'
import { faceVersionOf } from '../../lib/face/version'
import { checkFaceSize, FACE_TOO_LARGE_MESSAGE } from '../../lib/face/size-limit'
import { faceMetricsForPrisma } from '../../lib/face/metrics'
import { respostaCpfDuplicado } from '../../lib/participants/cpf-duplicado'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken } from '../../lib/stand-access/validate'
import { occupiedSlotsWhere, formatRelease } from '../../lib/stand-access/occupancy'
import { onBecameEligible } from '../../lib/agent/sync-enqueue'
import { resolveConsentStamp, ConsentVersionMismatch } from '../../lib/consent'
import { encryptDocuments } from '../../lib/documents'

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
  consentTermVersion: Joi.string().allow('', null).optional(), // eco da versão exibida (checagem de corrida)
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

    const { token, name, cpf, email, phone, faceImage, faceData, consent, consentTermVersion, customData } = value

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
        ...respostaCpfDuplicado()
      })
    }

    // Biometria: criptografa a imagem (AES-256-GCM) — nunca armazenar plaintext
    let encryptedFaceData: Buffer | null = null
    let faceVersion: string | null = null // F5: hash do conteúdo da face
    // Medição REAL do detector (MediaPipe); null se o cliente não mediu (legado).
    const faceInterocularPx =
      faceData && typeof faceData.faceInterocularPx === 'number'
        ? faceData.faceInterocularPx
        : null
    if (faceImage) {
      const dataUrl = faceImage.includes(',')
        ? faceImage
        : `data:image/jpeg;base64,${faceImage}`
      // BARREIRA DE TAMANHO (o cliente já recomprime em degraus; isto é a
      // segunda camada, para cliente antigo em cache, requisição fora do app
      // ou compressão que não coube). Foto grande demais é aceita pelo cadastro
      // e RECUSADA pelo terminal dias depois — falhar aqui, na cara de quem
      // pode tirar outra foto, é o único momento barato.
      const tamanho = checkFaceSize(dataUrl)
      if (!tamanho.ok) {
        return res.status(413).json({
          error: 'Face image too large',
          message: FACE_TOO_LARGE_MESSAGE,
          bytes: tamanho.bytes,
          limit: tamanho.limite
        })
      }
      encryptedFaceData = encryptString(dataUrl)
      faceVersion = faceVersionOf(dataUrl)
    }

    const { documents, ...otherCustomData } = customData || {}

    // [assim-mesmo] Captura sem validação (câmera do sistema com MediaPipe morto):
    // faceInterocularPx vem null (sentinela honesto) e faceData.faceDetected === false.
    // Marca no customData p/ conferência operacional (distingue de legado, que é null SEM
    // esta chave). Ver painel/export "Sem validação".
    if (faceData && faceData.faceDetected === false) {
      otherCustomData.__faceUnvalidated = true
    }

    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '90', 10)
    const retentionDate = new Date(event.endDate)
    retentionDate.setDate(retentionDate.getDate() + retentionDays)

    // Termo versionado: server-authoritative (carimba versão + snapshot; corrida → 409).
    // Evento sem versão ativa → stamp vazio (fluxo antigo intacto).
    let consentStamp
    try {
      consentStamp = resolveConsentStamp(event, consentTermVersion, { retentionDays })
    } catch (e) {
      if (e instanceof ConsentVersionMismatch) {
        return res.status(409).json({
          error: 'Consent term updated',
          message: 'O termo de consentimento foi atualizado. Recarregue a página para ler e aceitar a nova versão.',
          currentVersion: e.expected
        })
      }
      throw e
    }

    const ip = getClientIp(req)
    const userAgent = (req.headers['user-agent'] as string) || 'unknown'

    // Dados do participante — montados uma vez; usados na reserva rápida ou no
    // caminho autoritativo (cache "cheio").
    const participantData = {
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
      ...faceMetricsForPrisma(faceData),
      faceVersion,
      consentAccepted: consent,
      consentIp: ip,
      consentDate: new Date(),
      consentText: consentStamp.consentText, // snapshot do termo aceito (null = fluxo antigo)
      consentTermVersion: consentStamp.consentTermVersion, // versão aceita (null = fluxo antigo)
      retentionDate,
      deviceInfo: userAgent,
      documents: encryptDocuments(documents || {}), // cifrado em repouso (AES-256-GCM)
      customData: otherCustomData || {}
    }

    // ── Reserva de vaga (caminho quente) ───────────────────────────────
    // UPDATE condicional atômico: o lock de linha dura APENAS o UPDATE, não uma
    // transação interativa. Cadastros simultâneos serializam por microssegundos no
    // servidor em vez de segurar conexão do pool esperando `FOR UPDATE` — era isso
    // que esgotava o pool e derrubava 34/50 com P2028 (ver scripts/loadtest).
    // O Postgres reavalia `currentCount < maxRegistrations` contra o valor
    // recém-commitado, então a reserva NUNCA fura o limite (limite rígido).
    const reserved = await prisma.$executeRaw`
      UPDATE stands
      SET "currentCount" = "currentCount" + 1
      WHERE id = ${standId} AND "currentCount" < "maxRegistrations"
    `

    let participant
    if (reserved === 1) {
      // Vaga reservada. Cria o participante FORA de qualquer lock; se a criação
      // falhar, devolve a vaga (compensação) para a vaga não vazar.
      try {
        participant = await prisma.participant.create({ data: participantData })
      } catch (createErr) {
        await prisma.$executeRaw`
          UPDATE stands SET "currentCount" = "currentCount" - 1
          WHERE id = ${standId} AND "currentCount" > 0
        `
        throw createErr
      }
    } else {
      // Cache diz "cheio". Pode ser cheio de verdade OU cache defasado por locks
      // da Fase 7 que expiraram sem evento de escrita (ver occupancy.ts: o slot
      // "libera sozinho" na virada do dia). Só aqui — no limite da capacidade,
      // baixo volume — vale a transação autoritativa que reconta canonicamente,
      // cria SOB o lock (sem furar) e reconcilia o cache defasado.
      participant = await prisma.$transaction(async (tx) => {
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

        const created = await tx.participant.create({ data: participantData })

        // Reconcilia o cache defasado para a contagem canônica + esta criação,
        // curando a defasagem de locks expirados para as próximas reservas rápidas.
        await tx.stand.update({
          where: { id: standId },
          data: { currentCount: occupied + 1 }
        })

        return created
      })
    }

    // Evento SEM-APROVAÇÃO: já fica elegível no registro → identidade + fan-out
    // (pós-commit da transação). Idempotente e não-fatal.
    if (event.requiresApprovalForAccess === false) {
      try {
        await onBecameEligible(event.id, participant.id)
      } catch (syncErr) {
        console.error('fan-out do sync falhou no registro de stand sem-aprovação:', syncErr)
      }
    }

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
        ...respostaCpfDuplicado()
      })
    }
    // Contenção de conexão/transação: transitório. Devolve 503 (não 500) para o
    // client poder retentar, e loga o código Prisma para diagnóstico.
    if (error.code === 'P2024' || error.code === 'P2028') {
      console.error(`Stand registration contention (${error.code}):`, error.message)
      return res.status(503).json({
        error: 'Service busy',
        message: 'Muitas pessoas cadastrando ao mesmo tempo. Aguarde um instante e tente novamente.'
      })
    }
    console.error('Stand registration error:', error?.code ?? '(sem código)', error)
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
