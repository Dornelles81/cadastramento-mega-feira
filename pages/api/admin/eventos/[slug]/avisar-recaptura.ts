/**
 * GET  /api/admin/eventos/[slug]/avisar-recaptura  → prévia: quem precisa de foto
 * POST /api/admin/eventos/[slug]/avisar-recaptura  → envia os e-mails
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ O POST EXISTE MAS **NÃO É O CANAL ADOTADO** (decisão de 04/09/2026).   ║
 * ║                                                                           ║
 * ║ A organização decidiu NÃO enviar comunicado por e-mail aos responsáveis   ║
 * ║ de stand — a comunicação com os gestores passa pelo canal próprio dela.   ║
 * ║ O que se usa deste endpoint é o GET: a LISTA de quem precisa de foto,     ║
 * ║ agrupada por stand, para ser repassada por fora.                          ║
 * ║                                                                           ║
 * ║ Não clique em enviar achando que é o fluxo normal. Se algum dia o e-mail  ║
 * ║ voltar a ser o canal, isto aqui é a decisão a revisar — não um bug.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
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
import { motivoDaRecaptura, frasePara, type MotivoRecaptura } from '../../../../../lib/participants/recaptura'
import { sendRecapturaEmail, type PessoaParaRecapturar } from '../../../../../lib/email/recaptura-fotos'

/** Stands por chamada. Ver "Escala" no topo. */
const LOTE = 20



interface StandPendente {
  standId: string
  code: string
  name: string
  email: string | null
  responsibleName: string | null
  pessoas: PessoaParaRecapturar[]
}

async function levantar(
  eventId: string,
  /**
   * Classes a incluir. Ausente = todas — o GET de prévia sempre pede tudo, para
   * o operador ver o quadro inteiro antes de escolher.
   *
   * Existe porque as quatro classes NÃO têm a mesma urgência, e o levantamento
   * de 04/09 mostrou por quê: das 47 fotos que o nosso gate marcou como risco e
   * que chegaram ao equipamento, o equipamento aceitou as 47. Já `sem-foto` e
   * `recusada-device` são fato e veredito — quem está nelas comprovadamente não
   * entra. Disparar as quatro juntas mandaria 86 pedidos de foto quando 11 são
   * os que importam agora, e gastaria a paciência dos gestores antes da feira.
   */
  tipos?: MotivoRecaptura[]
): Promise<StandPendente[]> {
  // O filtro "só quem TEM foto" saiu daqui em 04/09/2026: quem está sem foto
  // nenhuma é justamente o caso mais grave, e era o único que o aviso não
  // enxergava. Ver lib/participants/recaptura.ts para as três origens.
  const ps = await prisma.participant.findMany({
    where: { eventId, isDeleted: false, status: 'active' },
    select: {
      name: true, faceInterocularPx: true, customData: true,
      faceData: true, faceImageUrl: true,
      // Veredito do equipamento. `faceState: 'failed'` = o device recebeu a foto
      // e recusou (SubpicAnalysisModelingError e afins). Só contamos as linhas
      // em push: `removalState: 'none'`, senão uma falha de remoção antiga
      // entraria como se fosse problema de foto.
      terminalSyncs: {
        where: { faceState: 'failed', removalState: 'none' },
        select: { id: true }
      },
      stand: {
        select: { id: true, code: true, name: true, responsibleEmail: true, responsibleName: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  const porStand = new Map<string, StandPendente>()
  for (const p of ps) {
    if (!p.stand) continue // sem stand não há a quem avisar
    const motivo = motivoDaRecaptura({
      faceData: p.faceData,
      faceImageUrl: p.faceImageUrl,
      faceInterocularPx: p.faceInterocularPx,
      customData: p.customData,
      terminaisComFalha: p.terminalSyncs.length
    })
    if (!motivo) continue
    if (tipos && !tipos.includes(motivo)) continue

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
    porStand.get(p.stand.id)!.pessoas.push({ nome: p.name, motivo: frasePara(motivo), tipo: motivo })
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
    // Contagem por CLASSE: o painel precisa distinguir "sem foto" de "o
    // equipamento recusou" — são o mesmo pedido para o gestor, mas problemas
    // diferentes para quem opera o evento.
    const porTipo: Record<string, number> = {}
    for (const st of stands) {
      for (const pes of st.pessoas) {
        const k = pes.tipo ?? 'desconhecido'
        porTipo[k] = (porTipo[k] ?? 0) + 1
      }
    }
    return res.status(200).json({
      evento: event.name,
      lote: LOTE,
      totalStands: stands.length,
      totalPessoas: stands.reduce((s, x) => s + x.pessoas.length, 0),
      porTipo,
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

    // Classes a avisar. Sem `tipos`, mantém o comportamento antigo (todas) para
    // não quebrar chamador existente — mas a UI SEMPRE manda, porque escolher é
    // o ponto: ver a prévia e decidir a quem pedir foto.
    const TIPOS_VALIDOS: MotivoRecaptura[] = ['sem-foto', 'recusada-device', 'nao-validada', 'medida-baixa']
    const tiposPedidos = Array.isArray(req.body?.tipos)
      ? (req.body.tipos as unknown[]).filter((t): t is MotivoRecaptura =>
          typeof t === 'string' && (TIPOS_VALIDOS as string[]).includes(t))
      : undefined
    if (Array.isArray(req.body?.tipos) && (!tiposPedidos || tiposPedidos.length === 0)) {
      return res.status(400).json({ error: 'Nenhuma classe válida em `tipos`.' })
    }

    const stands = await levantar(event.id, tiposPedidos)
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
