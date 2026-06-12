/**
 * Rate limiting simples em memória (janela deslizante).
 *
 * Limitação: em ambiente serverless cada instância tem seu próprio contador,
 * então o limite efetivo é por instância. Serve como primeira barreira contra
 * brute-force e abuso; para garantia global usar Upstash/Vercel KV (Fase 2).
 */
import type { NextApiRequest, NextApiResponse } from 'next'

interface Entry {
  timestamps: number[]
}

const buckets = new Map<string, Entry>()
const MAX_BUCKETS = 10_000

function cleanup(windowMs: number) {
  if (buckets.size < MAX_BUCKETS) return
  const cutoff = Date.now() - windowMs
  buckets.forEach((entry, key) => {
    if (entry.timestamps.every((t: number) => t < cutoff)) buckets.delete(key)
  })
}

export function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  if (Array.isArray(forwarded)) return forwarded[0]
  return req.socket.remoteAddress || 'unknown'
}

/**
 * Retorna true se a requisição está dentro do limite; false se excedeu.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  cleanup(windowMs)

  const entry = buckets.get(key) || { timestamps: [] }
  entry.timestamps = entry.timestamps.filter((t) => t >= cutoff)

  if (entry.timestamps.length >= maxRequests) {
    buckets.set(key, entry)
    return false
  }

  entry.timestamps.push(now)
  buckets.set(key, entry)
  return true
}

/**
 * Aplica rate limit por IP e responde 429 se excedido.
 * Retorna true se a requisição pode prosseguir.
 */
export function rateLimitOrReject(
  req: NextApiRequest,
  res: NextApiResponse,
  scope: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const ip = getClientIp(req)
  if (!checkRateLimit(`${scope}:${ip}`, maxRequests, windowMs)) {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
    })
    return false
  }
  return true
}
