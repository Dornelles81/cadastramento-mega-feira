import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * POST /api/access/vehicle-check-in
 * Body: { vehicleCredentialId, eventId, gate?, operatorName?, requirePreviousExit? }
 * Registers vehicle entry. Blocks if vehicle is already inside (requirePreviousExit=true).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    vehicleCredentialId,
    eventId,
    gate,
    operatorName,
    requirePreviousExit = true
  } = req.body

  if (!vehicleCredentialId || !eventId) {
    return res.status(400).json({ error: 'vehicleCredentialId and eventId are required' })
  }

  try {
    const vehicle = await prisma.vehicleCredential.findUnique({
      where: { id: vehicleCredentialId },
      select: { id: true, number: true, type: true, plate: true, isActive: true, eventId: true }
    })

    if (!vehicle) return res.status(404).json({ error: 'Vehicle credential not found' })
    if (!vehicle.isActive) return res.status(403).json({ error: 'Vehicle credential is inactive' })

    const lastLog = await prisma.vehicleAccessLog.findFirst({
      where: { vehicleCredentialId },
      orderBy: { createdAt: 'desc' }
    })

    const isCurrentlyInside = lastLog?.type === 'ENTRY'

    if (requirePreviousExit && isCurrentlyInside) {
      return res.status(400).json({
        error: 'Already inside',
        message: `Veículo ${vehicle.number} já registrou entrada. Registre a saída primeiro.`,
        lastAccess: { type: lastLog!.type, time: lastLog!.createdAt, gate: lastLog!.gate }
      })
    }

    const log = await prisma.vehicleAccessLog.create({
      data: { vehicleCredentialId, eventId, type: 'ENTRY', gate, operatorName }
    })

    return res.status(200).json({
      success: true,
      message: 'Entrada de veículo registrada',
      log: { id: log.id, type: log.type, time: log.createdAt },
      vehicle: { id: vehicle.id, number: vehicle.number, type: vehicle.type, plate: vehicle.plate }
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
