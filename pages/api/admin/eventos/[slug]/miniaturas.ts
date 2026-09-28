/**
 * GET /api/admin/eventos/[slug]/miniaturas?ids=<id>,<id>,...
 *
 * Miniaturas (WebP 96×96) das fotos de até MAX_IDS participantes do evento,
 * para a lista do painel. A tela pede só as linhas que estão NA TELA, em lote
 * (ver components/admin/useMiniaturas). A foto cheia continua em
 * /api/participant-image, pedida quando alguém abre o participante.
 *
 * Resposta: { miniaturas: { [id]: dataUrl }, semFoto: id[] }
 *   `semFoto` lista quem foi atendido e não tem imagem — a tela para de pedir.
 *   Id que não é do evento, removido ou expurgado simplesmente não aparece em
 *   nenhum dos dois: não confirmamos a existência de cadastro fora do escopo.
 *
 * Autorização: mesma régua de /api/admin/participants-full, que alimenta a
 * lista — perfil de admin e `canView` no evento do slug.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { getFaceImageDataUrl } from '../../../../../lib/face-image'
import { miniaturaDeDataUrl } from '../../../../../lib/face/thumbnail'

const MAX_IDS = 40
const ID_SHAPE = /^[0-9a-f-]{36}$/i

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // Miniatura de rosto ainda é biometria: nada de cache compartilhado ou em disco.
  res.setHeader('Cache-Control', 'private, no-store')

  const { slug, ids } = req.query
  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Slug do evento é obrigatório' })
  }

  const lista = Array.from(
    new Set(
      (typeof ids === 'string' ? ids : '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => ID_SHAPE.test(s))
    )
  )
  if (lista.length === 0) {
    return res.status(400).json({ error: 'Informe ids' })
  }
  if (lista.length > MAX_IDS) {
    return res.status(400).json({ error: `No máximo ${MAX_IDS} ids por chamada` })
  }

  const evento = await prisma.event.findUnique({ where: { slug }, select: { id: true, slug: true } })
  if (!evento) {
    return res.status(404).json({ error: 'Evento não encontrado' })
  }
  const podeVer =
    hasEventPermission(session, evento.id, 'canView') || hasEventPermission(session, evento.slug, 'canView')
  if (!podeVer) {
    return res.status(403).json({ error: 'Sem permissão para ver os participantes deste evento' })
  }

  // Removido/expurgado: a exclusão apagou a biometria, e mesmo que uma linha
  // antiga ainda tivesse bytes, a regra de /api/participant-image vale aqui.
  const participantes = await prisma.participant.findMany({
    where: { id: { in: lista }, eventId: evento.id, isDeleted: false, NOT: { status: 'removed' } },
    select: { id: true, faceData: true, faceImageUrl: true }
  })

  const miniaturas: Record<string, string> = {}
  const semFoto: string[] = []
  await Promise.all(
    participantes.map(async (p) => {
      try {
        const cheia = getFaceImageDataUrl(p)
        const mini = cheia ? await miniaturaDeDataUrl(cheia) : null
        if (mini) miniaturas[p.id] = mini
        else semFoto.push(p.id)
      } catch (err: any) {
        // Tolerante, como tryGetFaceImageDataUrl: uma foto ilegível vira
        // círculo sem foto na lista, nunca 500 para o lote inteiro. O erro
        // alto dessa foto continua no /api/agent/work, onde ela é o produto.
        console.error(`[miniaturas] participante ${p.id}: ${err?.name ?? 'erro'} — ${err?.message ?? err}`)
        semFoto.push(p.id)
      }
    })
  )

  return res.status(200).json({ miniaturas, semFoto })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
