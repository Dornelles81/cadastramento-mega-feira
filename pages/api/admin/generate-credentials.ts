import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { eventId, onlyApproved = true, reset = false } = req.body
  if (!eventId) return res.status(400).json({ error: 'eventId obrigatório' })

  try {
    // If reset, clear all credential numbers for this event first
    if (reset) {
      await prisma.participant.updateMany({
        where: { eventId, isDeleted: false },
        data: { credentialNumber: null }
      })
    }

    // Find participants without credential numbers
    const where: Record<string, unknown> = {
      eventId,
      isActive: true,
      isDeleted: false,
      credentialNumber: null
    }
    if (onlyApproved) where.approvalStatus = 'approved'

    const participants = await prisma.participant.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (participants.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: 'Nenhum participante sem credencial encontrado' })
    }

    // Get current max credential number for this event to continue sequencing
    let startNumber = 1
    if (!reset) {
      const existing = await prisma.participant.findMany({
        where: { eventId, credentialNumber: { not: null } },
        select: { credentialNumber: true }
      })
      if (existing.length > 0) {
        const max = Math.max(...existing.map(p => parseInt(p.credentialNumber || '0')))
        startNumber = max + 1
      }
    }

    // Assign sequential numbers in a transaction
    const updates = participants.map((p, idx) =>
      prisma.participant.update({
        where: { id: p.id },
        data: { credentialNumber: String(startNumber + idx).padStart(4, '0') }
      })
    )

    await prisma.$transaction(updates)

    return res.status(200).json({
      success: true,
      count: participants.length,
      message: `${participants.length} credencial(is) gerada(s) com sucesso`
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    return res.status(500).json({ error: message })
  }
}
