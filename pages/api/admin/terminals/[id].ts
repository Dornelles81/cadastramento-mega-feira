/**
 * Admin — CRUD de terminais (atualização/remoção).
 *   PUT    /api/admin/terminals/[id]   atualiza; senha só é reescrita se enviada
 *   DELETE /api/admin/terminals/[id]   remove (cascade nos ParticipantTerminalSync)
 *
 * Reset de senha do device: a senha nova entra criptografada em
 * Terminal.passwordEncrypted, NUNCA no código/env. Enviar string vazia/null
 * mantém a senha atual (não apaga sem querer).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES } from '../../../../lib/api-auth'
import { encryptString } from '../../../../lib/crypto'

function publicTerminal(t: any) {
  const { passwordEncrypted, ...rest } = t
  return { ...rest, hasPassword: !!passwordEncrypted }
}

async function handler(req: NextApiRequest, res: NextApiResponse, _session: Session) {
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: 'id ausente' })

  if (req.method === 'PUT') {
    const { name, ipAddress, port, useHttps, username, password, gate, capacityLimit, eventId, isActive } = req.body || {}
    const data: any = {}
    if (name !== undefined) data.name = name
    if (ipAddress !== undefined) data.ipAddress = ipAddress
    if (port !== undefined) data.port = Number(port)
    if (useHttps !== undefined) data.useHttps = useHttps === true
    if (username !== undefined) data.username = username
    if (gate !== undefined) data.gate = gate || null
    if (capacityLimit !== undefined) data.capacityLimit = Number(capacityLimit)
    if (eventId !== undefined) data.eventId = eventId || null
    if (isActive !== undefined) data.isActive = isActive === true
    // Senha só é reescrita quando vier um valor não-vazio.
    if (password) data.passwordEncrypted = encryptString(String(password))

    try {
      const updated = await prisma.terminal.update({ where: { id }, data })
      return res.status(200).json({ terminal: publicTerminal(updated) })
    } catch {
      return res.status(404).json({ error: 'Terminal não encontrado' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.terminal.delete({ where: { id } })
      return res.status(200).json({ success: true })
    } catch {
      return res.status(404).json({ error: 'Terminal não encontrado' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
