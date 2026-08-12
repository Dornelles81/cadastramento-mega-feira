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
import { createAllocation } from '../../../../lib/terminals/allocation'

function publicTerminal(t: any) {
  const { passwordEncrypted, ...rest } = t
  return { ...rest, hasPassword: !!passwordEncrypted }
}

async function handler(req: NextApiRequest, res: NextApiResponse, _session: Session) {
  if (req.method === 'GET') {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined
    // Filtro por ALOCAÇÃO (TerminalEvent), não mais pela coluna deprecada.
    // Propositalmente sem recorte de período: o admin precisa enxergar também
    // o terminal cuja alocação ainda não começou ou já terminou — esconder
    // faria parecer que o equipamento sumiu do evento.
    const rows = await prisma.terminal.findMany({
      where: eventId ? { allocations: { some: { eventId } } } : {},
      orderBy: { createdAt: 'asc' }
    })
    return res.status(200).json({ terminals: rows.map(publicTerminal) })
  }

  if (req.method === 'POST') {
    const { name, ipAddress, port, useHttps, username, password, gate, capacityLimit, eventId, startDate, endDate, isActive } = req.body || {}
    if (!name || !ipAddress) {
      return res.status(400).json({ error: 'name e ipAddress são obrigatórios' })
    }

    // Vínculo com evento vira ALOCAÇÃO COM PERÍODO. O corpo aceita startDate e
    // endDate; sem eles, o período assumido é o do próprio evento — que é o
    // significado prático de "este terminal atende esta feira".
    let periodo: { startDate: Date; endDate: Date } | null = null
    if (eventId) {
      const ev = await prisma.event.findUnique({
        where: { id: String(eventId) },
        select: { startDate: true, endDate: true }
      })
      if (!ev) {
        return res.status(400).json({ error: `evento ${eventId} não encontrado` })
      }
      periodo = {
        startDate: startDate ? new Date(startDate) : ev.startDate,
        endDate: endDate ? new Date(endDate) : ev.endDate
      }
      if (isNaN(periodo.startDate.getTime()) || isNaN(periodo.endDate.getTime())) {
        return res.status(400).json({ error: 'startDate/endDate inválidos' })
      }
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
        isActive: isActive !== false
      }
    })

    if (eventId && periodo) {
      try {
        await createAllocation({ terminalId: created.id, eventId: String(eventId), ...periodo })
      } catch (allocErr: any) {
        // Terminal criado mas sem alocação: some do escopo do sync em vez de
        // sincronizar errado. Reportado para o admin corrigir o período.
        return res.status(201).json({
          terminal: publicTerminal(created),
          warning: `terminal criado, mas a alocação falhou: ${allocErr?.message}`
        })
      }
    }
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
