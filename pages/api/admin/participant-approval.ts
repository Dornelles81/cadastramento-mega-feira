import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== 'Bearer admin-token-mega-feira-2025') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { participantId, action, reason, notes } = req.body

  if (!participantId || !action) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' })
  }

  try {
    // Get current participant
    const participant = await prisma.participant.findUnique({
      where: { id: participantId }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    const previousStatus = participant.approvalStatus || 'pending'
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const now = new Date()

    // Update participant
    const updatedParticipant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        approvalStatus: newStatus,
        approvedAt: action === 'approve' ? now : null,
        approvedBy: action === 'approve' ? 'admin' : null,
        rejectionReason: action === 'reject' ? reason : null
      }
    })

    // Create approval log
    await prisma.approvalLog.create({
      data: {
        participantId,
        action: newStatus,
        previousStatus,
        newStatus,
        reason,
        notes,
        adminUser: 'admin',
        adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null
      }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: action.toUpperCase(),
        entityType: 'participant',
        entityId: participantId,
        adminUser: 'admin',
        adminIp: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
        previousData: {
          approvalStatus: previousStatus
        },
        newData: {
          approvalStatus: newStatus
        },
        description: `Participant ${participant.name} (${participant.cpf}) was ${newStatus}`,
        metadata: {
          reason,
          notes
        }
      }
    })

    res.status(200).json({ 
      success: true, 
      participant: updatedParticipant,
      message: `Participant ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    })

  } catch (error: any) {
    console.error('Error updating participant approval:', error)
    res.status(500).json({ error: 'Failed to update participant approval', details: error.message })
  } finally {
    await prisma.$disconnect()
  }
}