import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { getSession } from '../../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res)
  if (!session?.user) return res.status(401).json({ error: 'Não autenticado' })

  // ── GET: list vehicle credentials + event orientations ────────────────────
  if (req.method === 'GET') {
    const { eventId } = req.query
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId obrigatório' })
    }

    try {
      const [credentials, event] = await Promise.all([
        prisma.vehicleCredential.findMany({
          where: { eventId, isActive: true },
          orderBy: { number: 'asc' }
        }),
        prisma.event.findUnique({
          where: { id: eventId },
          select: { vehicleOrientations: true }
        })
      ])
      return res.status(200).json({ credentials, vehicleOrientations: event?.vehicleOrientations ?? '' })
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao buscar credenciais', details: error.message })
    }
  }

  // ── PUT: save vehicle orientations for an event ────────────────────────────
  if (req.method === 'PUT') {
    const { eventId, vehicleOrientations } = req.body as { eventId: string; vehicleOrientations: string }
    if (!eventId) return res.status(400).json({ error: 'eventId obrigatório' })

    try {
      await prisma.event.update({
        where: { id: eventId },
        data: { vehicleOrientations: vehicleOrientations ?? null }
      })
      return res.status(200).json({ success: true })
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao salvar orientações', details: error.message })
    }
  }

  // ── POST: create credential batch ──────────────────────────────────────────
  if (req.method === 'POST') {
    const { eventId, credentials } = req.body as {
      eventId: string
      credentials: { number: string; type: string }[]
    }

    if (!eventId || !Array.isArray(credentials) || credentials.length === 0) {
      return res.status(400).json({ error: 'eventId e credentials obrigatórios' })
    }

    const LIMIT_PER_EVENT = 3000

    try {
      // Check current count against limit
      const currentCount = await prisma.vehicleCredential.count({
        where: { eventId, isActive: true }
      })

      // Count only truly new credentials (not upserts of existing ones)
      const existingNumbers = await prisma.vehicleCredential.findMany({
        where: { eventId, number: { in: credentials.map(c => c.number) } },
        select: { number: true }
      })
      const existingSet = new Set(existingNumbers.map(e => e.number))
      const newCount = credentials.filter(c => !existingSet.has(c.number)).length

      if (currentCount + newCount > LIMIT_PER_EVENT) {
        return res.status(400).json({
          error: `Limite de ${LIMIT_PER_EVENT} credenciais por evento atingido. Atual: ${currentCount}, tentando adicionar: ${newCount} novas.`
        })
      }

      // Upsert each credential (skip duplicates via update)
      const created = await prisma.$transaction(
        credentials.map(c =>
          prisma.vehicleCredential.upsert({
            where: { eventId_number: { eventId, number: c.number } },
            create: { eventId, number: c.number, type: c.type },
            update: { type: c.type, isActive: true }
          })
        )
      )
      return res.status(201).json({ credentials: created, count: created.length, total: currentCount + newCount })
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao criar credenciais', details: error.message })
    }
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
