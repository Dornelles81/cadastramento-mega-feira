/**
 * GET  /api/admin/eventos/[slug]/avisar-recaptura  → prévia: quem seria avisado
 * POST /api/admin/eventos/[slug]/avisar-recaptura  → envia os e-mails
 *
 * Agrupa por STAND os participantes com foto de risco e manda ao responsável a
 * lista da equipe DELE. Quem tem contato com o participante é o gestor — a
 * organização não tem: no levantamento de 2026-08-31, nenhum participante de
 * risco tinha telefone próprio, e o e-mail do responsável estava em todos os
 * stands.
 *
 * ── Escala ────────────────────────────────────────────────────────────────
 * O evento previsto tem 100+ stands. Serverless tem teto de tempo, e o Resend
 * tem limite de taxa, então NÃO existe "enviar para todos de uma vez": cada
 * chamada processa no máximo LOTE stands e devolve `restantes`. Quem chama
 * repete até zerar. É deliberado — um laço de 100 envios dentro de uma request
 * é a receita para timeout no meio, sem saber quem recebeu e quem não.
 *
 * O GET não envia nada e é o modo de conferir antes.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { prisma } from '../../../../../lib/prisma'
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth'
import { riscoDeFace, type RiscoFace } from '../../../../../lib/participants/face-risk'
import { deriveFaceStatus } from '../../../../../lib/face/status'
import { sendRecapturaEmail, type PessoaParaRecapturar } from '../../../../../lib/email/recaptura-fotos'

/** Stands por chamada. Ver "Escala" no topo. */
const LOTE = 20

function motivoDe(risco: Exclude<RiscoFace, null>): string {
  // Linguagem de quem vai PEDIR a foto, não do gate.
  return risco === 'nao-validada'
    ? 'o rosto não foi confirmado na foto'
    : 'o rosto ficou pequeno demais na foto'
}

interface StandPendente {
  standId: string
  code: string
  name: string
  email: string | null
  responsibleName: string | null
  pessoas: PessoaParaRecapturar[]
}

async function levantar(eventId: string): Promise<StandPendente[]> {
  const ps = await prisma.participant.findMany({
    where: {
      eventId, isDeleted: false, status: 'active',
      OR: [{ faceData: { not: null } }, { faceImageUrl: { not: null } }]
    },
    select: {
      name: true, faceInterocularPx: true, customData: true,
      stand: {
        select: { id: true, code: true, name: true, responsibleEmail: true, responsibleName: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  const porStand = new Map<string, StandPendente>()
  for (const p of ps) {
    if (!p.stand) continue // sem stand não há a quem avisar
    const risco = riscoDeFace({
      faceInterocularPx: p.faceInterocularPx,
      faceStatus: deriveFaceStatus(p.faceInterocularPx),
      faceUnvalidated: !!(p.customData as any)?.__faceUnvalidated
    })
    if (!risco) continue

    if (!porStand.has(p.stand.id)) {
      porStand.set(p.stand.id, {
        standId: p.stand.id,
        code: p.stand.code,
        name: p.stand.name,
        email: p.stand.responsibleEmail,
        responsibleName: p.stand.responsibleName,
        pessoas: []
      })
    }
    porStand.get(p.stand.id)!.pessoas.push({ nome: p.name, motivo: motivoDe(risco) })
  }
  // Maior pendência primeiro: se o lote cortar, corta o que menos importa.
  return [...porStand.values()].sort((a, b) => b.pessoas.length - a.pessoas.length)
}

async function handler(req: NextApiRequest, res: NextApiResponse, session: Session) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) return res.status(400).json({ error: 'slug ausente' })

  const event = await prisma.event.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, name: true, slug: true }
  })
  if (!event) return res.status(404).json({ error: 'Evento não encontrado' })

  // ────────────────────────────────────────────────────────────── GET (prévia)
  if (req.method === 'GET') {
    if (!hasEventPermission(session, event.slug, 'canView')) {
      return res.status(403).json({ error: 'Sem permissão neste evento' })
    }
    const stands = await levantar(event.id)
    return res.status(200).json({
      evento: event.name,
      lote: LOTE,
      totalStands: stands.length,
      totalPessoas: stands.reduce((s, x) => s + x.pessoas.length, 0),
      semEmail: stands.filter((s) => !s.email).map((s) => s.code),
      stands: stands.map((s) => ({
        standId: s.standId, code: s.code, name: s.name,
        email: s.email, temEmail: !!s.email,
        pessoas: s.pessoas
      }))
    })
  }

  // ───────────────────────────────────────────────────────────── POST (envia)
  if (req.method === 'POST') {
    // Enviar e-mail em nome da organização é ação externa: exige canEdit, não
    // apenas ver.
    if (!hasEventPermission(session, event.slug, 'canEdit')) {
      return res.status(403).json({ error: 'Sem permissão para enviar avisos neste evento' })
    }

    const standId = typeof req.body?.standId === 'string' ? req.body.standId : null
    const todos = req.body?.todos === true
    if (!standId && !todos) {
      return res.status(400).json({ error: 'Informe standId ou todos: true' })
    }

    const stands = await levantar(event.id)
    const alvo = standId ? stands.filter((s) => s.standId === standId) : stands
    if (alvo.length === 0) {
      return res.status(404).json({ error: 'Nenhum stand com pendência corresponde ao pedido' })
    }

    const comEmail = alvo.filter((s) => s.email)
    const semEmail = alvo.filter((s) => !s.email).map((s) => s.code)
    const fatia = comEmail.slice(0, LOTE)

    const enviados: { code: string; para: string; pessoas: number }[] = []
    const falhas: { code: string; erro: string }[] = []

    for (const s of fatia) {
      try {
        await sendRecapturaEmail({
          to: s.email!,
          responsibleName: s.responsibleName,
          standName: s.name,
          standCode: s.code,
          eventName: event.name,
          // Sem link de painel: gerar token de acesso aqui criaria acesso novo
          // como efeito colateral de "avisar". O gestor já tem o link dele.
          painelLink: null,
          pessoas: s.pessoas
        })
        enviados.push({ code: s.code, para: s.email!, pessoas: s.pessoas.length })
      } catch (e: any) {
        // Uma falha não derruba o lote: o relatório diz quem ficou de fora,
        // e reenviar para um stand já avisado é inofensivo (o e-mail é
        // informativo, não gera token nem muda estado).
        falhas.push({ code: s.code, erro: e?.message ?? 'erro desconhecido' })
      }
    }

    return res.status(200).json({
      enviados,
      falhas,
      semEmail,
      restantes: Math.max(comEmail.length - fatia.length, 0),
      dica: comEmail.length > fatia.length
        ? `Enviados ${fatia.length} de ${comEmail.length}. Chame de novo para continuar.`
        : undefined
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApiAuth(handler, { roles: ADMIN_ROLES })
