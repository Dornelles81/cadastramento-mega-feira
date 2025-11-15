import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      id,
      name,
      email,
      phone,
      faceImage,
      faceData,
      customData,
      documents
    } = req.body

    console.log('🔄 Updating participant:', { id, name })

    if (!id) {
      return res.status(400).json({ error: 'ID is required' })
    }

    // Check if participant exists
    const existing = await prisma.participant.findUnique({
      where: { id }
    })

    if (!existing) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    // Prepare update data
    const updateData: any = {}

    // Only update fields that were provided
    if (name) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone

    // Update face image if provided
    if (faceImage) {
      updateData.faceImageUrl = faceImage
    }

    // Update face data if provided
    if (faceData) {
      updateData.captureQuality = faceData.quality || faceData.qualityPercentage / 100
    }

    // Update custom data (merge with existing)
    if (customData) {
      const existingCustomData = (existing.customData as any) || {}
      updateData.customData = {
        ...existingCustomData,
        ...customData
      }
    }

    // Update documents (merge with existing)
    if (documents) {
      const existingDocuments = (existing.documents as any) || {}
      updateData.documents = {
        ...existingDocuments,
        ...documents
      }
    }

    // Update timestamp
    updateData.updatedAt = new Date()

    // Perform update
    const updated = await prisma.participant.update({
      where: { id },
      data: updateData
    })

    console.log('✅ Participant updated successfully:', updated.id)

    return res.status(200).json({
      success: true,
      message: 'Cadastro atualizado com sucesso!',
      participant: {
        id: updated.id,
        name: updated.name,
        cpf: updated.cpf
      }
    })

  } catch (error) {
    console.error('❌ Error updating participant:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao atualizar cadastro'
    })
  } finally {
    await prisma.$disconnect()
  }
}
