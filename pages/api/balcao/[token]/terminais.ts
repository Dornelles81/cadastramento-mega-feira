/**
 * POST /api/balcao/[token]/terminais   { documento, desde? }
 *
 * Onde a foto ATUAL da pessoa está nos terminais do evento — o "chegou nos 4
 * terminais" ou "recusada, tire outra" que o balcão mostra antes de a pessoa
 * sair. `desde` é o `trocadaEm` devolvido pela troca: só recusas depois dele
 * contam (ver estadoNosTerminais). POST para o documento não ir parar em URL
 * e log.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { abrirBalcao } from '../../../../lib/balcao/http'
import { buscarPorDocumento, estadoNosTerminais } from '../../../../lib/balcao/pessoa'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // O balcão consulta a cada 2 s por até 2 min: 60 chamadas por pessoa.
  const acesso = await abrirBalcao(req, res, 'balcao-terminais', 120, 60_000)
  if (!acesso) return

  try {
    const { documento, desde } = req.body ?? {}
    const r = await buscarPorDocumento(acesso.event.id, typeof documento === 'string' ? documento : '')
    if (r.tipo !== 'achou') return res.status(404).json({ error: 'nao-encontrado' })

    const d = typeof desde === 'string' ? new Date(desde) : null
    const evento = await prisma.event.findUnique({ where: { id: acesso.event.id }, select: { requiresApprovalForAccess: true } })
    const terminais = await estadoNosTerminais(
      r.pessoa,
      d && !Number.isNaN(d.getTime()) ? d : null,
      evento?.requiresApprovalForAccess ?? true
    )
    return res.status(200).json({ terminais })
  } catch (e: any) {
    console.error('[balcao/terminais]', e)
    return res.status(500).json({ error: 'Erro ao consultar os terminais' })
  }
}
