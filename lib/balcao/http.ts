/**
 * O que as três rotas do balcão têm em comum: método, limite de taxa, token.
 * Token inválido, revogado ou expirado → 404 genérico, sem dizer qual.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { rateLimitOrReject, getClientIp } from '../rate-limit'
import { validarBalcao, AcessoBalcao } from './acesso'

export async function abrirBalcao(
  req: NextApiRequest,
  res: NextApiResponse,
  escopo: string,
  limite: number,
  janelaMs: number
): Promise<AcessoBalcao | null> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return null
  }
  // Dado biométrico e documento: nada de cache em lugar nenhum.
  res.setHeader('Cache-Control', 'private, no-store')
  if (!rateLimitOrReject(req, res, escopo, limite, janelaMs)) return null
  const acesso = await validarBalcao(String(req.query.token ?? ''))
  if (!acesso) {
    res.status(404).json({ error: 'Link de balcão inválido, revogado ou expirado' })
    return null
  }
  return acesso
}

export function contexto(req: NextApiRequest) {
  return { ip: getClientIp(req), userAgent: (req.headers['user-agent'] as string) ?? null }
}
