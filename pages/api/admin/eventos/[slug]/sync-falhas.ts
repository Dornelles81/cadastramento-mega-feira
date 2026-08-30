/**
 * GET  /api/admin/eventos/[slug]/sync-falhas   → lista as linhas ESGOTADAS
 * POST /api/admin/eventos/[slug]/sync-falhas   → re-tenta ({ syncId } ou { todos: true })
 *
 * ── Por que esta tela precisa existir ──────────────────────────────────────
 * A tela de saúde mostra o NÚMERO de falhas por terminal, e o número sozinho
 * não permite agir: não diz quem falhou, nem por quê, nem se aquilo ainda vai
 * se resolver sozinho.
 *
 * Isso passou a importar mais depois que a reconciliação passou a respeitar o
 * teto de tentativas (ver o bloco TETO DE TENTATIVAS em `lib/agent/reconcile`).
 * Antes, toda linha voltava para a fila a cada 60s — de graça, e para sempre,
 * inclusive quando retentar era comprovadamente inútil. Agora uma linha
 * esgotada FICA esgotada, e é isso que se quer: retry cego contra erro
 * determinístico é trabalho puro (6.687 tentativas em 6 dias, no caso que
 * originou esta mudança).
 *
 * Mas parar de retentar sozinho só é aceitável se existir a saída manual. É
 * este endpoint: mostrar quem travou, com o erro que o device devolveu, e
 * permitir re-tentar depois de resolver a causa. Sem isso, o teto trocaria um
 * loop invisível por uma pessoa presa em silêncio — que é pior, porque na feira
 * ela aparece como "não passa na catraca" e ninguém sabe dizer por quê.
 *
 * O POST não conserta nada por conta própria: só devolve a linha à fila. Se a
 * causa continuar lá, ela esgota de novo — e isso é honesto.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { MAX_ATTEMPTS } from '../../../../../lib/agent/retry-policy'

/** Teto de linhas devolvidas no GET: a tela é para agir, não para paginar. */
const LIMITE_LISTA = 100

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug ausente' })

  const event = await prisma.event.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, slug: true }
  })
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' })

  // Terminais alocados ao evento — o recorte de tudo abaixo.
  const alocacoes = await prisma.terminalEvent.findMany({
    where: { eventId: event.id, isActive: true },
    select: { terminalId: true }
  })
  const terminalIds = [...new Set(alocacoes.map((a) => a.terminalId))]

  // Uma linha "esgotada" é a MESMA definição da tela de saúde: bateu o teto E
  // está em algum estado de falha. Os dois critérios juntos, sempre — só
  // `attempts` alto não basta (uma linha pode ter falhado e depois sincronizado).
  const whereEsgotadas = {
    terminalId: { in: terminalIds },
    attempts: { gte: MAX_ATTEMPTS },
    OR: [
      { faceState: 'failed' },
      { cardState: 'failed' },
      { removalState: 'failed' }
    ]
  }

  // ─────────────────────────────────────────────────────────────── GET
  if (req.method === 'GET') {
    if (!hasEventPermission(session, event.slug, 'canView')) {
      return res.status(403).json({ error: 'Sem permissão neste evento' })
    }
    if (terminalIds.length === 0) {
      return res.status(200).json({ maxTentativas: MAX_ATTEMPTS, total: 0, linhas: [] })
    }

    const total = await prisma.participantTerminalSync.count({ where: whereEsgotadas })
    const linhas = await prisma.participantTerminalSync.findMany({
      where: whereEsgotadas,
      take: LIMITE_LISTA,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        faceState: true,
        cardState: true,
        removalState: true,
        attempts: true,
        lastError: true,
        lastAttemptAt: true,
        terminal: { select: { id: true, name: true } },
        participant: { select: { id: true, name: true, employeeNo: true } }
      }
    })

    return res.status(200).json({
      maxTentativas: MAX_ATTEMPTS,
      total,
      truncado: total > linhas.length,
      linhas: linhas.map((l) => ({
        syncId: l.id,
        participante: l.participant.name,
        participanteId: l.participant.id,
        employeeNo: l.participant.employeeNo,
        terminal: l.terminal?.name ?? null,
        terminalId: l.terminal?.id ?? null,
        faceState: l.faceState,
        cardState: l.cardState,
        removalState: l.removalState,
        tentativas: l.attempts,
        // O erro CRU do device, sem reescrever: é ele que diz o que fazer, e
        // qualquer tradução nossa aqui perderia o subStatusCode.
        ultimoErro: l.lastError,
        ultimaTentativa: l.lastAttemptAt ? l.lastAttemptAt.toISOString() : null
      }))
    })
  }

  // ────────────────────────────────────────────────────────────── POST
  if (req.method === 'POST') {
    // Re-tentar MEXE na fila do device: exige permissão de edição, não só de ver.
    if (!hasEventPermission(session, event.slug, 'canEdit')) {
      return res.status(403).json({ error: 'Sem permissão para re-tentar neste evento' })
    }
    if (terminalIds.length === 0) {
      return res.status(200).json({ reenfileiradas: 0 })
    }

    const syncId = typeof req.body?.syncId === 'string' ? req.body.syncId : null
    const todos = req.body?.todos === true
    if (!syncId && !todos) {
      return res.status(400).json({ error: 'Informe syncId ou todos: true' })
    }

    // O `where` SEMPRE parte de whereEsgotadas: um syncId de outro evento, ou de
    // uma linha que não está esgotada, não deve ser tocado por este endpoint.
    const where = syncId ? { ...whereEsgotadas, id: syncId } : whereEsgotadas

    const alvos = await prisma.participantTerminalSync.findMany({
      where,
      select: { id: true, faceState: true, cardState: true, removalState: true }
    })
    if (alvos.length === 0) {
      return res.status(404).json({ error: 'Nenhuma linha esgotada corresponde ao pedido' })
    }

    // Devolve à fila SÓ o que está em falha — nada de marcar como pendente um
    // estado que já está `synced`, que faria o agente reescrever de graça.
    let reenfileiradas = 0
    for (const a of alvos) {
      await prisma.participantTerminalSync.update({
        where: { id: a.id },
        data: {
          ...(a.faceState === 'failed' ? { faceState: 'pending' } : {}),
          ...(a.cardState === 'failed' ? { cardState: 'pending' } : {}),
          ...(a.removalState === 'failed' ? { removalState: 'pending' } : {}),
          // O reset do contador é o ponto do botão: sem ele o `/work` continua
          // barrando a linha e o clique não faria nada visível.
          attempts: 0,
          lastError: null
        }
      })
      reenfileiradas++
    }

    return res.status(200).json({ reenfileiradas })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
