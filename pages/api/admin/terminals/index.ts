/**
 * Admin — CRUD de terminais (lista/criação).
 *   GET  /api/admin/terminals[?eventId=]   lista (NUNCA devolve a senha)
 *   POST /api/admin/terminals               cria (senha entra criptografada)
 *
 * A senha do device é criptografada (AES-256-GCM) antes de tocar o banco e só
 * volta a sair decriptada no /api/agent/terminals, sob token de agente.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../../lib/api-auth'
import { encryptString } from '../../../../lib/crypto'
import { backfillTerminal } from '../../../../lib/agent/sync-enqueue'

function publicTerminal(t: any) {
  const { passwordEncrypted, ...rest } = t
  return { ...rest, hasPassword: !!passwordEncrypted }
}

async function handler(req: NextApiRequest, res: NextApiResponse, _session: Session) {
  if (req.method === 'GET') {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined
    const rows = await prisma.terminal.findMany({
      where: eventId ? { eventId } : {},
      orderBy: { createdAt: 'asc' }
    })
    return res.status(200).json({ terminals: rows.map(publicTerminal) })
  }

  if (req.method === 'POST') {
    const { name, ipAddress, port, useHttps, username, password, gate, capacityLimit, eventId, isActive } = req.body || {}
    if (!name || !ipAddress) {
      return res.status(400).json({ error: 'name e ipAddress são obrigatórios' })
    }

    const created = await prisma.terminal.create({
      data: {
        name,
        ipAddress,
        port: port != null ? Number(port) : undefined,
        useHttps: useHttps === true,
        username: username || undefined,
        passwordEncrypted: password ? encryptString(String(password)) : undefined,
        gate: gate || null,
        capacityLimit: capacityLimit != null ? Number(capacityLimit) : undefined,
        eventId: eventId || null,
        isActive: isActive !== false
      }
    })
    // Backfill: o roster elegível do contexto já existente passa a ter linha de
    // sync pendente neste terminal novo (não duplica). Idempotente e não-fatal.
    try {
      await backfillTerminal(created.id)
    } catch (syncErr) {
      console.error('backfillTerminal falhou ao criar terminal:', syncErr)
    }

    return res.status(201).json({ terminal: publicTerminal(created) })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
