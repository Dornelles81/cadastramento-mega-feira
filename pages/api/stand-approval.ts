/**
 * POST /api/stand-approval — o responsável do stand aprova/rejeita a equipe.
 *
 * Espelha `stand-removal` e `stand-reactivation`: token de stand com escopo
 * `manage`, e o participante precisa pertencer AO STAND DO TOKEN — nunca se
 * confia no `participantId` que o cliente manda.
 *
 * ── Por que passa pelo mesmo núcleo ───────────────────────────────────────
 * `aplicarAprovacao` já aceita `actorType='stand_responsible'` desde que foi
 * unificado. Chamá-lo aqui é o que garante que a aprovação do gestor faça
 * EXATAMENTE o que a da organização faz: atribuir identidade, empurrar para os
 * terminais, gravar approvalLog e auditLog — e recusar quem está sem biometria.
 * Uma segunda implementação seria a quinta cópia que aquele módulo existe para
 * impedir.
 *
 * ── As quatro condições ───────────────────────────────────────────────────
 * 1. INTERRUPTOR POR EVENTO (`EventConfig.standApprovalEnabled`, default
 *    false): delegar acesso físico é decisão de quem organiza o evento.
 * 2. CONFIRMAÇÃO DO captureAnyway: aprovar foto que o detector nunca validou
 *    exige `confirmaFotoNaoValidada: true`. É o caso em que a credencial tem
 *    mais chance de não abrir a catraca no dia, e o gestor é quem tem contato
 *    com a pessoa para pedir outra foto.
 * 3. REJEITAR NÃO É REMOVER: `reject` muda `approvalStatus` e tira a pessoa dos
 *    terminais, mas ela CONTINUA no stand, ocupando a vaga, com a biometria
 *    intacta e reversível por uma aprovação. O remover do gestor é outra coisa
 *    — destrutivo, apaga a foto, consome cota de substituição.
 * 4. STATUS VISÍVEL: quem aprova precisa ver o que já decidiu (isso é a tela).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken } from '../../lib/stand-access/validate'
import { aplicarAprovacao, MENSAGEM_FALHA } from '../../lib/participants/approval'
import { riscoDeFace } from '../../lib/participants/face-risk'
import { deriveFaceStatus } from '../../lib/face/status'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!rateLimitOrReject(req, res, 'stand-approval', 60, 10 * 60 * 1000)) {
    return
  }

  const { token, participantId, acao, confirmaFotoNaoValidada } = req.body ?? {}
  if (!token || typeof token !== 'string' || !participantId || typeof participantId !== 'string') {
    return res.status(400).json({ error: 'Bad request', message: 'Dados incompletos.' })
  }
  if (acao !== 'approve' && acao !== 'reject') {
    return res.status(400).json({ error: 'Bad request', message: "Ação inválida." })
  }

  // Erro genérico para token inválido: não revelar se o stand existe.
  const access = await validateStandToken(token)
  if (!access) {
    return res.status(404).json({
      error: 'Invalid link',
      message: 'Link inválido ou expirado. Contate a organização.'
    })
  }
  if (access.scope !== 'manage') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Este link permite apenas cadastro. A aprovação é restrita ao responsável do stand.'
    })
  }

  // ── 1. INTERRUPTOR DO EVENTO ───────────────────────────────────────────────
  const cfg = access.event.id
    ? await prisma.eventConfig.findUnique({
        where: { eventId: access.event.id },
        select: { standApprovalEnabled: true }
      })
    : null
  if (!cfg?.standApprovalEnabled) {
    return res.status(403).json({
      error: 'Forbidden',
      message:
        'A aprovação pelo painel do stand não está habilitada neste evento. ' +
        'Quem aprova é a organização.'
    })
  }

  // ── ESCOPO: o participante tem de ser DESTE stand ──────────────────────────
  const p = await prisma.participant.findFirst({
    where: { id: participantId, standId: access.stand.id, isDeleted: false },
    select: {
      id: true, name: true, status: true, approvalStatus: true,
      faceInterocularPx: true, customData: true
    }
  })
  if (!p) {
    return res.status(404).json({
      error: 'Not found',
      message: 'Credenciado não encontrado neste stand.'
    })
  }
  // Removido não se aprova: ele não está na equipe.
  if (p.status !== 'active') {
    return res.status(409).json({
      error: 'Conflict',
      message:
        'Esta pessoa foi retirada da equipe. Para voltar, ela precisa se cadastrar ' +
        'novamente pelo link de cadastro do stand.'
    })
  }

  // ── REJEIÇÃO É DA ORGANIZAÇÃO, E SÓ ELA REABRE ────────────────────────────
  // O painel do gestor perdeu o botão de rejeitar (04/09/2026): em 466 aprovações
  // nenhum gestor de stand rejeitou ninguém, e "rejeitar mas continuar ocupando a
  // vaga" precisava de um modal para ser entendido — sinal de que o conceito não
  // cabia naquela tela.
  //
  // Mas o gestor CONTINUA vendo quem está rejeitado (badge vermelho no painel) e
  // continuava podendo aprovar. Sem esta guarda, uma rejeição feita pela
  // organização — que é decisão dela, tomada por um motivo que o gestor não
  // conhece — seria desfeita por um clique de quem não sabe que houve rejeição.
  // Caso concreto: um participante rejeitado de propósito em 02/09 seguia
  // aprovável pelo responsável do stand.
  if (acao === 'approve' && p.approvalStatus === 'rejected') {
    return res.status(409).json({
      error: 'Conflict',
      message:
        `${p.name} teve o cadastro recusado pela organização do evento. ` +
        'Só a organização pode liberar — fale com ela antes de aprovar.'
    })
  }

  // ── 2. CONFIRMAÇÃO DO captureAnyway ────────────────────────────────────────
  // Mesmo critério do painel do admin (`riscoDeFace`), para gestor e organização
  // não classificarem a mesma foto de formas diferentes.
  const risco = riscoDeFace({
    faceInterocularPx: p.faceInterocularPx,
    faceStatus: deriveFaceStatus(p.faceInterocularPx),
    faceUnvalidated: !!(p.customData as any)?.__faceUnvalidated
  })
  if (acao === 'approve' && risco === 'nao-validada' && confirmaFotoNaoValidada !== true) {
    return res.status(428).json({
      error: 'Confirmation required',
      precisaConfirmar: 'foto-nao-validada',
      message:
        `A foto de ${p.name} não foi validada pelo detector: há risco real de a credencial ` +
        'não abrir a catraca no dia. O ideal é pedir uma foto nova. Se ainda assim quiser ' +
        'aprovar, confirme.'
    })
  }

  const responsavel = access.stand.responsibleEmail?.trim()
  const resultado = await aplicarAprovacao({
    participantId: p.id,
    acao,
    ator: {
      tipo: 'stand_responsible',
      email: responsavel?.includes('@') ? responsavel : 'responsavel-stand',
      standId: access.stand.id
    },
    motivo: acao === 'reject' ? 'Rejeitado pelo responsável do stand' : null,
    ip: getClientIp(req)
  })

  if (!resultado) {
    return res.status(404).json({ error: 'Not found', message: 'Credenciado não encontrado.' })
  }
  if (!resultado.ok) {
    // Hoje só `sem-biometria`: aprovar sem foto produz um "Aprovado" que a
    // catraca desmente. A mensagem vem do núcleo, para gestor e organização
    // lerem exatamente a mesma coisa.
    return res.status(422).json({
      error: 'Unprocessable',
      falha: resultado.falha,
      message: MENSAGEM_FALHA[resultado.falha]
    })
  }

  return res.status(200).json({
    success: true,
    participantId: p.id,
    status: resultado.statusNovo,
    // false = a decisão valeu, mas o envio aos terminais falhou. O gestor
    // precisa saber que falta alguma coisa, em vez de ver só "aprovado".
    sincronizado: resultado.sincronizado,
    message:
      resultado.statusNovo === 'approved'
        ? `${p.name} aprovado.` + (resultado.sincronizado ? '' : ' Atenção: o envio aos terminais falhou — avise a organização.')
        : `${p.name} rejeitado. Ele continua no stand e pode ser aprovado depois.`
  })
}
