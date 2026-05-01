import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { getSession } from '../../../lib/auth'

/**
 * Fix participants whose eventCode doesn't match their linked event's code.
 * This corrects records created before eventCode normalization was in place.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res)
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  if (req.method === 'GET') {
    // Preview: show what would be fixed
    const participants = await prisma.participant.findMany({
      where: { eventId: { not: null } },
      select: { id: true, eventId: true, eventCode: true, event: { select: { code: true, name: true } } }
    })

    const mismatched = participants.filter(
      p => p.event && p.eventCode !== p.event.code
    )

    return res.status(200).json({
      total: participants.length,
      mismatchedCount: mismatched.length,
      preview: mismatched.slice(0, 20).map(p => ({
        id: p.id,
        currentEventCode: p.eventCode,
        correctEventCode: p.event?.code,
        eventName: p.event?.name
      }))
    })
  }

  if (req.method === 'POST') {
    // Apply fix
    const participants = await prisma.participant.findMany({
      where: { eventId: { not: null } },
      select: { id: true, eventId: true, eventCode: true, event: { select: { code: true } } }
    })

    const toFix = participants.filter(p => p.event && p.eventCode !== p.event.code)

    let fixed = 0
    for (const p of toFix) {
      await prisma.participant.update({
        where: { id: p.id },
        data: { eventCode: p.event!.code }
      })
      fixed++
    }

    return res.status(200).json({ fixed, message: `${fixed} participantes corrigidos` })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
