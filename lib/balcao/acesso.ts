/**
 * Links de BALCÃO de recoleta facial.
 *
 * Quem opera é pessoa temporária, contratada para a feira, no celular. O link
 * faz UMA coisa: achar alguém pelo documento e trocar a foto. Não lista
 * ninguém, não aprova, não exclui, não vê documento nem contato.
 *
 * Por que link e não conta no painel (decisão de 2026-09-28):
 *   - a sessão do painel é JWT de 24h que nada invalida — desativar a conta não
 *     corta quem já está logado. Aqui `revokedAt` é conferido em TODA chamada:
 *     revogar corta na hora, sem derrubar o painel de ninguém;
 *   - não cria mais uma conta com senha.
 *
 * Só o hash SHA-256 fica no banco; o link em claro existe uma vez, na geração.
 * Vários ativos por evento — um por operador, identificado pelo `label`, que é
 * o que aparece na auditoria de cada troca.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '../prisma'

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,48}$/
const TOQUE_MS = 5 * 60 * 1000 // lastUsedAt no máximo a cada 5 min

export interface AtorAdmin {
  adminId?: string | null
  adminEmail: string
  ip?: string | null
  userAgent?: string | null
}

export interface AcessoBalcao {
  tokenId: string
  label: string
  event: { id: string; name: string; slug: string }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function linkDoBalcao(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://cadastramento-mega-feira.vercel.app'
  return `${base.replace(/\/$/, '')}/balcao/${token}`
}

/**
 * Expira no fim do evento (a feira) — nunca depois. Evento já encerrado: 12h,
 * para um uso excepcional não virar link eterno.
 */
export function validadeDoBalcao(eventEnd: Date, agora: Date = new Date()): Date {
  return eventEnd > agora ? eventEnd : new Date(agora.getTime() + 12 * 60 * 60 * 1000)
}

export async function gerarLinkBalcao(
  eventId: string,
  label: string,
  ator: AtorAdmin
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const evento = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, endDate: true, name: true } })
  if (!evento) throw new Error('Evento não encontrado')

  const token = randomBytes(32).toString('base64url')
  const expiresAt = validadeDoBalcao(evento.endDate)

  const [criado] = await prisma.$transaction([
    prisma.balcaoAccessToken.create({
      data: {
        eventId,
        tokenHash: hash(token),
        label,
        createdBy: ator.adminId ?? null,
        createdByEmail: ator.adminEmail,
        expiresAt
      },
      select: { id: true }
    }),
    prisma.auditLog.create({
      data: {
        eventId,
        adminId: ator.adminId ?? null,
        adminEmail: ator.adminEmail,
        action: 'BALCAO_LINK_GERADO',
        entityType: 'balcao',
        actorType: 'admin',
        actorIdentifier: ator.adminEmail,
        ip: ator.ip ?? null,
        userAgent: ator.userAgent ?? null,
        description: `Link de balcão "${label}" gerado para o evento ${evento.name}, válido até ${expiresAt.toISOString()}`,
        severity: 'WARNING'
      }
    })
  ])
  return { id: criado.id, token, expiresAt }
}

export async function revogarLinkBalcao(id: string, eventId: string, ator: AtorAdmin): Promise<boolean> {
  const alvo = await prisma.balcaoAccessToken.findFirst({ where: { id, eventId }, select: { id: true, label: true, revokedAt: true } })
  if (!alvo) return false
  if (alvo.revokedAt) return true
  await prisma.$transaction([
    prisma.balcaoAccessToken.update({
      where: { id },
      data: { revokedAt: new Date(), revokedBy: ator.adminEmail }
    }),
    prisma.auditLog.create({
      data: {
        eventId,
        adminId: ator.adminId ?? null,
        adminEmail: ator.adminEmail,
        action: 'BALCAO_LINK_REVOGADO',
        entityType: 'balcao',
        entityId: id,
        actorType: 'admin',
        actorIdentifier: ator.adminEmail,
        ip: ator.ip ?? null,
        userAgent: ator.userAgent ?? null,
        description: `Link de balcão "${alvo.label}" revogado`,
        severity: 'WARNING'
      }
    })
  ])
  return true
}

/**
 * Valida o token bruto da URL. null = inválido, revogado ou expirado — quem
 * chama responde 404 genérico, sem dizer qual dos três.
 */
export async function validarBalcao(tokenBruto: string): Promise<AcessoBalcao | null> {
  if (typeof tokenBruto !== 'string' || !TOKEN_SHAPE.test(tokenBruto)) return null
  const h = hash(tokenBruto)
  const linha = await prisma.balcaoAccessToken.findUnique({
    where: { tokenHash: h },
    select: {
      id: true, tokenHash: true, label: true, revokedAt: true, expiresAt: true, lastUsedAt: true,
      event: { select: { id: true, name: true, slug: true } }
    }
  })
  if (!linha) return null
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(linha.tokenHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (linha.revokedAt) return null
  if (linha.expiresAt < new Date()) return null

  // Telemetria barata: "último uso" com resolução de minutos basta para saber
  // se o balcão está em operação. Nunca derruba a chamada.
  if (!linha.lastUsedAt || Date.now() - linha.lastUsedAt.getTime() > TOQUE_MS) {
    prisma.balcaoAccessToken.update({ where: { id: linha.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  }

  return { tokenId: linha.id, label: linha.label, event: linha.event }
}
