/**
 * POST /api/stand-reactivation — o gestor devolve à equipe alguém que removeu.
 *
 * Espelha `stand-removal`: token de stand com escopo `manage`, e o participante
 * precisa pertencer AO STAND DO TOKEN — nunca se confia no `participantId` que
 * o cliente manda. Quem removeu é quem desfaz.
 *
 * Reativar NÃO devolve acesso físico: a remoção apagou a biometria, então a
 * pessoa volta à equipe INELEGÍVEL e só chega ao terminal depois de tirar foto
 * nova. A resposta diz isso explicitamente (`precisaFoto`), porque o gestor
 * precisa saber que falta um passo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken } from '../../lib/stand-access/validate'
import { reativarParticipante } from '../../lib/participants/reactivation'
import { formatRelease } from '../../lib/stand-access/occupancy'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!rateLimitOrReject(req, res, 'stand-reactivation', 20, 10 * 60 * 1000)) {
    return
  }

  const { token, participantId } = req.body ?? {}
  if (!token || typeof token !== 'string' || !participantId || typeof participantId !== 'string') {
    return res.status(400).json({ error: 'Bad request', message: 'Dados incompletos.' })
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
      message: 'Este link permite apenas cadastro. A reativação é restrita ao responsável do stand.'
    })
  }

  const responsavel = access.stand.responsibleEmail?.trim()
  const ator = {
    tipo: 'stand_responsible' as const,
    email: responsavel?.includes('@') ? responsavel : 'responsavel-stand'
  }

  const r = await reativarParticipante({
    participantId,
    standIdEsperado: access.stand.id, // ESCOPO: só quem é deste stand
    ator,
    ip: getClientIp(req),
    userAgent: (req.headers['user-agent'] as string) ?? null
  })

  if (!r.ok) {
    if (r.falha === 'nao-encontrado' || r.falha === 'nao-removido') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Credenciado não encontrado neste stand, ou já está ativo.'
      })
    }
    if (r.falha === 'vaga-travada') {
      return res.status(409).json({
        error: 'Slot locked',
        message:
          'Esta pessoa usou a credencial hoje, então a vaga fica reservada até ' +
          `${formatRelease(r.liberaEm!)}. Depois disso a reativação fica liberada.`
      })
    }
    if (r.falha === 'stand-cheio') {
      return res.status(409).json({
        error: 'Stand full',
        message: 'O stand está lotado. Para reativar, é preciso liberar uma vaga antes.'
      })
    }
  }

  return res.status(200).json({
    success: true,
    participante: r.participante,
    cotaDevolvida: r.cotaDevolvida ?? false,
    precisaFoto: r.participante ? !r.participante.temFoto : true,
    message: r.participante && !r.participante.temFoto
      ? `${r.participante.name} voltou para a equipe, mas precisa tirar uma foto nova antes de acessar o evento.`
      : `${r.participante?.name ?? 'Credenciado'} voltou para a equipe.`
  })
}
