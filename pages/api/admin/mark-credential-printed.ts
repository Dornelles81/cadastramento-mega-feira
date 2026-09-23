import { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { withApiAuth, ADMIN_ROLES } from '../../../lib/api-auth'
import { prisma } from '../../../lib/prisma'

/**
 * Marca credencial como impressa. Consumidores: app/admin/eventos/[slug] e
 * app/admin/access-control/credentials (onde o maço de etiquetas sai de fato).
 * Ambas são área de admin, onde o OPERATOR não entra (o middleware o desvia),
 * então a régua apertada aqui é ADMIN_ROLES.
 *
 * ── AUTORIZAÇÃO ────────────────────────────────────────────────────────────
 * Exigia apenas `getServerSession` sem checagem de role: qualquer sessão
 * autenticada, de qualquer role, chamava.
 *
 * ⚠️ ESCOPO POR EVENTO: PENDENTE — é role, não vínculo. Ver a nota em
 * ./vehicle-credentials/index.ts: nenhuma conta OPERATOR tem vínculo em
 * `EventAdminAccess` hoje, então exigir `hasEventPermission` recusaria a
 * portaria inteira. Registrado na dívida do levantamento.
 */
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }


  const { participantIds } = req.body as { participantIds: string[] }

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'participantIds required' })
  }

  try {
    const now = new Date()
    const adminId = session.user.id

    // ── Por que updateMany e não SQL cru ────────────────────────────────────
    // O $executeRawUnsafe que ficava aqui NUNCA funcionou — nenhum participante
    // chegou a ser marcado, em nenhum evento, desde que o campo existe. Dois
    // erros, cada um bastando sozinho para derrubar a query:
    //   1. escrevia `credential_printed` (snake_case), mas as colunas do banco
    //      são "credentialPrinted"/"credentialPrintedAt"/"credentialPrintedBy"
    //      — camelCase entre aspas, como o 0_init as criou → 42703.
    //   2. comparava `id = ANY($3::uuid[])` sendo `participants.id` uma coluna
    //      TEXT (uuid gerado na aplicação) → 42883.
    // O comentário original justificava o SQL cru dizendo que o client Prisma
    // podia não ter os campos ainda; ele tem (o schema os declara há tempo), e
    // é o client que garante nome de coluna e tipo de id corretos.
    const { count } = await prisma.participant.updateMany({
      where: { id: { in: participantIds } },
      data: {
        credentialPrinted: true,
        credentialPrintedAt: now,
        credentialPrintedBy: adminId
      }
    })

    // `count` real, não participantIds.length: ids inexistentes não viram marca.
    return res.status(200).json({ updated: count })
  } catch (error: any) {
    console.error('Error marking credentials as printed:', error)
    return res.status(500).json({ error: error.message })
  }
}

// 401 sem sessão, 403 fora de ADMIN_ROLES. BALCAO não entra.
export default withApiAuth(handler, { roles: ADMIN_ROLES })
