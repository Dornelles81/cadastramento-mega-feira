import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid participant ID' })
  }

  // Get admin IP
  const adminIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown'

  switch (req.method) {
    case 'GET':
      return handleGet(id, res)
    case 'PUT':
      return handleUpdate(id, req.body, adminIp, res)
    case 'DELETE':
      return handleDelete(id, adminIp, res)
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

async function handleUpdate(id: string, data: any, adminIp: string, res: NextApiResponse) {
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
            'admin',
            ${adminIp},
            ${JSON.stringify(currentParticipant)}::jsonb,
            ${JSON.stringify(updatedParticipant)}::jsonb,
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

async function handleDelete(id: string, adminIp: string, res: NextApiResponse) {
  try {
    // Get the participant data before deleting
    const participant = await prisma.participant.findUnique({
      where: { id }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
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
            "previousData", "newData", description, metadata, "createdAt"
          ) VALUES (
            gen_random_uuid(),
            'DELETE',
            'participant',
            ${id},
            'admin',
            ${adminIp},
            ${JSON.stringify(participant)}::jsonb,
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