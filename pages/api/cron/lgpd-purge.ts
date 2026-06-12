import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { SENSITIVE_PARTICIPANT_CLEAR } from '../../../lib/participant-sensitive'

/**
 * Expurgo LGPD — executado diariamente pelo Vercel Cron (vercel.json).
 *
 * Remove dados biométricos e documentos de participantes cuja retentionDate
 * já passou (definida no cadastro como fim do evento + DATA_RETENTION_DAYS).
 * O registro é mantido anonimizado quanto à biometria para fins de auditoria;
 * a exclusão completa da linha é decisão de política a aplicar futuramente.
 *
 * Proteção: o Vercel Cron envia "Authorization: Bearer ${CRON_SECRET}".
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET não configurado' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  try {
    const now = new Date()

    // Participantes com retenção vencida e que ainda têm dados biométricos/documentos
    const expired = await prisma.participant.findMany({
      where: {
        retentionDate: { lt: now },
        OR: [
          { faceData: { not: null } },
          { faceImageUrl: { not: null } },
          { documents: { not: { equals: null } } }
        ]
      },
      select: { id: true, eventId: true }
    })

    let purged = 0

    for (const p of expired) {
      await prisma.participant.update({
        where: { id: p.id },
        data: SENSITIVE_PARTICIPANT_CLEAR
      })

      await prisma.auditLog.create({
        data: {
          eventId: p.eventId,
          action: 'LGPD_PURGE',
          entityType: 'participant',
          entityId: p.id,
          adminUser: 'system-cron',
          description: 'Dados biométricos e documentos expurgados por política de retenção (LGPD)',
          severity: 'INFO'
        }
      })

      purged++
    }

    console.log(`🧹 LGPD purge: ${purged} participante(s) expurgado(s)`)

    return res.status(200).json({
      success: true,
      purged,
      executedAt: now.toISOString()
    })
  } catch (error: any) {
    console.error('LGPD purge error:', error)
    return res.status(500).json({ error: 'Purge failed', details: error.message })
  }
}
