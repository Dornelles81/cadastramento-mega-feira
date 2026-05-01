import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

/**
 * GET /api/access/vehicle-status?number=V-001&eventCode=MEGA
 * Returns current inside status for a vehicle credential
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { number, eventCode } = req.query

  if (!number || !eventCode) {
    return res.status(400).json({ error: 'number and eventCode are required' })
  }

  try {
    const eventCodeStr = String(eventCode)
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { id: eventCodeStr },
          { slug: eventCodeStr },
          { code: eventCodeStr },
          { code: { equals: eventCodeStr, mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true }
    })

    if (!event) return res.status(404).json({ error: 'Event not found' })

    const vehicle = await prisma.vehicleCredential.findUnique({
      where: { eventId_number: { eventId: event.id, number: String(number) } },
      select: { id: true, number: true, type: true, plate: true, isActive: true }
    })

    if (!vehicle) return res.status(404).json({ error: 'Vehicle credential not found' })
    if (!vehicle.isActive) return res.status(403).json({ error: 'Vehicle credential is inactive' })

    const lastLog = await prisma.vehicleAccessLog.findFirst({
      where: { vehicleCredentialId: vehicle.id },
      orderBy: { createdAt: 'desc' }
    })

    const isInside = lastLog?.type === 'ENTRY'

    const [totalEntries, totalExits] = await Promise.all([
      prisma.vehicleAccessLog.count({ where: { vehicleCredentialId: vehicle.id, type: 'ENTRY' } }),
      prisma.vehicleAccessLog.count({ where: { vehicleCredentialId: vehicle.id, type: 'EXIT' } })
    ])

    return res.status(200).json({
      vehicle: {
        id: vehicle.id,
        number: vehicle.number,
        type: vehicle.type,
        plate: vehicle.plate
      },
      eventName: event.name,
      isInside,
      canEnter: !isInside,
      canExit: isInside,
      lastAccess: lastLog ? {
        type: lastLog.type,
        time: lastLog.createdAt,
        gate: lastLog.gate
      } : null,
      totalEntries,
      totalExits
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
