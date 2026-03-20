import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * POST /api/access/vehicle-check-out
 * Body: { vehicleCredentialId, eventId, gate?, operatorName?, forceExit? }
 * Registers vehicle exit. Blocks if vehicle has no registered entry (unless forceExit=true).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    vehicleCredentialId,
    eventId,
    gate,
    operatorName,
    forceExit = false
  } = req.body

  if (!vehicleCredentialId || !eventId) {
    return res.status(400).json({ error: 'vehicleCredentialId and eventId are required' })
  }

  try {
    const vehicle = await prisma.vehicleCredential.findUnique({
      where: { id: vehicleCredentialId },
      select: { id: true, number: true, type: true, plate: true, isActive: true }
    })

    if (!vehicle) return res.status(404).json({ error: 'Vehicle credential not found' })

    const lastLog = await prisma.vehicleAccessLog.findFirst({
      where: { vehicleCredentialId },
      orderBy: { createdAt: 'desc' }
    })

    const isCurrentlyInside = lastLog?.type === 'ENTRY'

    if (!forceExit && !isCurrentlyInside) {
      return res.status(400).json({
        error: 'Not inside',
        message: `Veículo ${vehicle.number} não possui entrada registrada.`,
        lastAccess: lastLog ? { type: lastLog.type, time: lastLog.createdAt } : null
      })
    }

    const entryTime = lastLog?.createdAt || new Date()
    const exitTime = new Date()
    const durationMs = exitTime.getTime() - entryTime.getTime()
    const durationMinutes = Math.round(durationMs / 60000)

    const log = await prisma.vehicleAccessLog.create({
      data: {
        vehicleCredentialId,
        eventId,
        type: 'EXIT',
        gate,
        operatorName
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Saída de veículo registrada',
      log: { id: log.id, type: log.type, time: log.createdAt },
      duration: { minutes: durationMinutes, formatted: formatDuration(durationMs) },
      vehicle: { id: vehicle.id, number: vehicle.number, type: vehicle.type, plate: vehicle.plate }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`
}
