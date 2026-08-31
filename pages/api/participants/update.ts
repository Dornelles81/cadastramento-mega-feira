import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { encryptString } from '../../../lib/crypto'
import { faceVersionOf } from '../../../lib/face/version'
import { checkFaceSize, FACE_TOO_LARGE_MESSAGE } from '../../../lib/face/size-limit'
import { faceMetricsForPrisma } from '../../../lib/face/metrics'
import { rateLimitOrReject, getClientIp } from '../../../lib/rate-limit'
import { validateEditToken, auditSelfUpdate } from '../../../lib/participant-edit/validate'
import { enqueueFaceChange, onBecameEligible } from '../../../lib/agent/sync-enqueue'
import { encryptDocuments } from '../../../lib/documents'

/**
 * POST /api/participants/update
 * Body: { token, name?, email?, phone?, faceImage?, faceData?, customData?, documents? }
 *
 * Atualização self-service do PRÓPRIO cadastro. O participantId vem
 * EXCLUSIVAMENTE do token validado no servidor — qualquer `id` no body é
 * IGNORADO (fecha o buraco original). Auditoria PARTICIPANT_SELF_UPDATE com
 * throttle.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!rateLimitOrReject(req, res, 'participants-update', 10, 10 * 60 * 1000)) {
    return
  }

  try {
    const { token, name, email, phone, faceImage, faceData, customData, documents } = req.body

    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Token de edição obrigatório' })
    }

    const access = await validateEditToken(token)
    if (!access) {
      return res.status(401).json({ error: 'Link de edição inválido ou expirado' })
    }

    // participantId SÓ do token; o `id` do body é ignorado de propósito
    const participantId = access.participant.id

    const existing = await prisma.participant.findUnique({ where: { id: participantId } })
    if (!existing) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    const updateData: any = {}
    if (name) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone

    // Foto: criptografada (AES-256-GCM), nunca plaintext
    let faceChanged = false
    if (faceImage) {
      const faceDataUrl = faceImage.includes(',')
        ? faceImage
        : `data:image/jpeg;base64,${faceImage}`
      // BARREIRA DE TAMANHO — ver lib/face/size-limit. Vale igualmente na
      // EDIÇÃO: uma re-captura grande demais substituiria uma foto que hoje
      // funciona por uma que o terminal recusa, e o `faceVersion` novo ainda
      // mandaria o agente apagar e recriar o usuário no device.
      const tamanho = checkFaceSize(faceDataUrl)
      if (!tamanho.ok) {
        return res.status(413).json({
          error: 'Face image too large',
          message: FACE_TOO_LARGE_MESSAGE,
          bytes: tamanho.bytes,
          limit: tamanho.limite
        })
      }
      updateData.faceData = encryptString(faceDataUrl)
      updateData.faceImageUrl = null
      updateData.faceVersion = faceVersionOf(faceDataUrl) // F5: nova versão
      faceChanged = true
    }
    if (faceData && typeof faceData.faceInterocularPx === 'number') {
      updateData.faceInterocularPx = faceData.faceInterocularPx
    }
    // Métricas do detector: só quando a FOTO mudou. Elas descrevem uma captura
    // específica — gravá-las num update que só mexeu no telefone deixaria bbox
    // e pose descrevendo uma imagem que não é mais a que está guardada.
    // Sobrescreve inclusive com null: foto nova sem medição (captureAnyway) tem
    // de APAGAR as métricas da foto anterior, senão a antiga fica valendo para
    // a imagem nova.
    if (faceChanged) {
      Object.assign(updateData, faceMetricsForPrisma(faceData))
    }
    if (customData) {
      updateData.customData = { ...((existing.customData as any) || {}), ...customData }
    }
    if (documents) {
      // merge existentes (já cifrados) + novos (em claro) → encryptDocuments é
      // idempotente: cifra só os novos, mantém os existentes. Também migra
      // oportunisticamente docs legados em claro deste participante.
      updateData.documents = encryptDocuments({ ...((existing.documents as any) || {}), ...documents })
    }
    updateData.updatedAt = new Date()

    const updated = await prisma.participant.update({
      where: { id: participantId },
      data: updateData
    })

    // F5: re-captura → re-empurra a face nova p/ os terminais (imediato).
    //
    // As DUAS chamadas, nesta ordem, porque cobrem casos diferentes:
    //
    //   onBecameEligible  → PRIMEIRA foto. Quem foi aprovado ANTES de ter foto
    //     não tinha `employeeNo` (a identidade só é atribuída a quem é
    //     elegível, e sem face ninguém é), e não tinha linha de sync utilizável.
    //     Agora a foto chegou: a pessoa virou elegível NESTE instante, e é aqui
    //     que a identidade é atribuída e o fan-out acontece. Sem isto, ela
    //     ficava ativa, aprovada, com biometria — e invisível nos terminais,
    //     sem erro em lugar nenhum: o `/work` pula linha sem `employeeNo` e a
    //     reconciliação nem olha (filtra `employeeNo: { not: null }`).
    //
    //   enqueueFaceChange → TROCA de foto de quem já estava sincronizado. É um
    //     `updateMany`, que devolve face e card a `pending` nas linhas que já
    //     existem. Não cria linha nenhuma, então não substitui a de cima.
    //
    // Não é preciso checar elegibilidade aqui: `onBecameEligible` já não
    // atribui identidade a inelegível, e `enqueueForContext` recusa por conta
    // própria — inclusive o revival de quem está em remoção.
    if (faceChanged) {
      try {
        await onBecameEligible(existing.eventId, participantId)
      } catch (e) { console.error('onBecameEligible falhou:', e) }
      try { await enqueueFaceChange(participantId) } catch (e) { console.error('enqueueFaceChange falhou:', e) }
    }

    await auditSelfUpdate(access, {
      ip: getClientIp(req),
      userAgent: (req.headers['user-agent'] as string) ?? null
    })

    return res.status(200).json({
      success: true,
      message: 'Cadastro atualizado com sucesso!',
      participant: { id: updated.id, name: updated.name }
    })
  } catch (error) {
    console.error('Error updating participant (self):', error)
    return res.status(500).json({ error: 'Internal server error', message: 'Erro ao atualizar cadastro' })
  }
}
