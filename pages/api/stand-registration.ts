import type { NextApiRequest, NextApiResponse } from 'next'
import Joi from 'joi'
import { respostaCpfDuplicado } from '../../lib/participants/cpf-duplicado'
import { rateLimitOrReject, getClientIp } from '../../lib/rate-limit'
import { validateStandToken } from '../../lib/stand-access/validate'
import { formatRelease } from '../../lib/stand-access/occupancy'
import { registrarCredenciado, StandFullError } from '../../lib/participants/registrar'

/**
 * Cadastro de credenciado via link mágico do stand (SPEC seção 2.3).
 *
 * O standId vem EXCLUSIVAMENTE da validação server-side do token — nunca do
 * client. A vaga é validada dentro de uma transação com lock pessimista na
 * linha do stand (ADENDO seção 2) para evitar corrida; currentCount é cache
 * derivado, atualizado na mesma transação.
 */

const schema = Joi.object({
  token: Joi.string().required(),
  name: Joi.string().min(2).max(100).required(),
  cpf: Joi.string().required(),
  email: Joi.string().email().allow('', null).optional(),
  phone: Joi.string().min(10).allow('', null).optional(),
  faceImage: Joi.string().allow('', null).optional(),
  faceData: Joi.object().allow(null).optional(),
  consent: Joi.boolean().valid(true).required(),
  consentTermVersion: Joi.string().allow('', null).optional(), // eco da versão exibida (checagem de corrida)
  customData: Joi.object().optional()
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!rateLimitOrReject(req, res, 'stand-register', 10, 10 * 60 * 1000)) {
    return
  }

  try {
    const { error, value } = schema.validate(req.body)
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message
      })
    }

    const { token, name, cpf, email, phone, faceImage, faceData, consent, consentTermVersion, customData } = value

    // Erro genérico para token inválido: não revelar se o stand existe
    const access = await validateStandToken(token)

    if (!access) {
      return res.status(404).json({
        error: 'Invalid link',
        message: 'Link inválido ou expirado. Contate a organização.'
      })
    }

    // ── SÓ O LINK DE CADASTRO CADASTRA ────────────────────────────────────────
    // Até 2026-09-02 este endpoint aceitava QUALQUER token válido, inclusive o
    // de gestão — e o painel do responsável tinha um botão "Cadastrar
    // credenciado" apontando para o mesmo token. O efeito colateral era o
    // problema: repassar o link de gestão para a equipe FUNCIONAVA, todo mundo
    // se cadastrava, nada dava erro — e cada uma dessas pessoas ficava também
    // com acesso à lista completa do stand (foto e CPF de todos) e ao botão de
    // excluir. Foi o que aconteceu em CASA-SUECOS: 37 cadastros por um link de
    // gestão aberto de 36 pontos de acesso distintos.
    //
    // A trava vive TAMBÉM em /stand/[token]/cadastro, que recusa a página antes
    // do formulário. Só aqui, a pessoa preencheria tudo, tiraria a foto e
    // tomaria 403 no envio — trocar uma falha silenciosa por um beco sem saída
    // no fim do fluxo seria piorar.
    //
    // Não afeta quem JÁ se cadastrou: os cadastros existentes seguem intactos, e
    // o gestor continua podendo excluí-los (stand-removal exige `manage`).
    if (access.scope !== 'register') {
      return res.status(403).json({
        error: 'Forbidden',
        message:
          'Este é o link de gestão do stand, que não cadastra. Peça à organização o link de ' +
          'cadastro da equipe — é ele que deve ser compartilhado com quem vai se credenciar.'
      })
    }

    // ── O CADASTRO EM SI ───────────────────────────────────────────────────
    // Extraído para lib/participants/registrar.ts em 04/09/2026 para o balcão
    // poder reusá-lo sem duplicar reserva de vaga, limite de foto, carimbo do
    // termo e fan-out. Nada acima desta linha mudou: rate limit, schema,
    // validação do token e a trava de scope continuam sendo a autorização, e é
    // ela que produz o `standId` — o núcleo confia no contexto que recebe.
    const resultado = await registrarCredenciado(
      { name, cpf, email, phone, faceImage, faceData, consent, consentTermVersion, customData },
      {
        standId: access.stand.id,
        standMaxRegistrations: access.stand.maxRegistrations,
        eventId: access.event.id,
        ip: getClientIp(req),
        userAgent: (req.headers['user-agent'] as string) || 'unknown'
      }
    )

    if (!resultado.ok) {
      return res.status(resultado.recusa.status).json(resultado.recusa.body)
    }

    return res.status(201).json({
      success: true,
      registrationId: resultado.participant.id,
      message: 'Cadastro realizado com sucesso',
      participant: {
        id: resultado.participant.id,
        name: resultado.participant.name,
        registeredAt: resultado.participant.createdAt
      }
    })

  } catch (error: any) {
    if (error instanceof StandFullError) {
      if (error.nextRelease) {
        return res.status(409).json({
          error: 'Slots locked',
          message: `Stand sem vagas disponíveis no momento. Próxima liberação: ${formatRelease(error.nextRelease)}.`,
          nextRelease: error.nextRelease
        })
      }
      return res.status(409).json({
        error: 'Stand full',
        message: 'Stand lotado. Para liberar uma vaga, o responsável precisa excluir um credenciado.'
      })
    }
    if (error.code === 'P2002') {
      return res.status(409).json({
        ...respostaCpfDuplicado()
      })
    }
    // Contenção de conexão/transação: transitório. Devolve 503 (não 500) para o
    // client poder retentar, e loga o código Prisma para diagnóstico.
    if (error.code === 'P2024' || error.code === 'P2028') {
      console.error(`Stand registration contention (${error.code}):`, error.message)
      return res.status(503).json({
        error: 'Service busy',
        message: 'Muitas pessoas cadastrando ao mesmo tempo. Aguarde um instante e tente novamente.'
      })
    }
    console.error('Stand registration error:', error?.code ?? '(sem código)', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Erro interno do servidor. Tente novamente.'
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}
