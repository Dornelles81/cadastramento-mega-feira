import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { prepararFotoNova, propagarFotoNova } from '../../../lib/participants/foto-nova'
import { rateLimitOrReject, getClientIp } from '../../../lib/rate-limit'
import { validateEditToken, auditSelfUpdate } from '../../../lib/participant-edit/validate'
import { encryptDocuments } from '../../../lib/documents'
import { digitosDoTelefone, erroDeTelefoneOpcional } from '../../../lib/participants/telefone'

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
    if (phone !== undefined) {
      // Este endpoint gravava o telefone EXATAMENTE como chegou — sem validar e
      // sem normalizar. É dele que vêm os registros com '+' e espaço no banco,
      // e era o último lugar onde o formato podia entrar torto depois de a
      // correção fechar o cadastro. Mesma regra dos outros dois caminhos.
      const erroTelefone = erroDeTelefoneOpcional(phone)
      if (erroTelefone) {
        return res.status(400).json({ error: 'Invalid phone', message: erroTelefone })
      }
      updateData.phone = digitosDoTelefone(phone)
    }

    // Foto: cifrada, com barreira de tamanho, faceVersion e métricas da captura
    // — tudo em lib/participants/foto-nova, o mesmo caminho do balcão.
    // As métricas só entram quando a FOTO mudou: gravá-las num update que só
    // mexeu no telefone deixaria bbox e pose descrevendo outra imagem.
    let faceChanged = false
    if (faceImage) {
      const foto = prepararFotoNova(faceImage, faceData)
      if (!foto.ok) {
        return res.status(foto.status).json(foto.body)
      }
      Object.assign(updateData, foto.data)
      faceChanged = true
    }
    if (faceData && typeof faceData.faceInterocularPx === 'number') {
      updateData.faceInterocularPx = faceData.faceInterocularPx
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
    // O porquê das duas chamadas está em lib/participants/foto-nova.
    if (faceChanged) {
      await propagarFotoNova(existing.eventId, participantId)
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
