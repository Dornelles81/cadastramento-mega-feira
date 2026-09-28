/**
 * POST /api/balcao/[token]/buscar   { documento }
 *
 * Acha UMA pessoa ativa do evento do link pelo CPF ou documento estrangeiro e
 * devolve o necessário para a CONFERÊNCIA no balcão: nome, stand, aprovação,
 * a foto atual (320 px, para comparar com o rosto e o documento na frente do
 * operador) e onde essa foto está nos terminais — que costuma ser a razão de
 * a porta não ter aberto.
 *
 * Não devolve: CPF inteiro, telefone, e-mail, documentos, id do participante.
 * A troca de foto pede o documento de novo, em vez de um id guardado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { abrirBalcao, contexto } from '../../../../lib/balcao/http'
import { buscarPorDocumento, documentoMascarado, estadoNosTerminais } from '../../../../lib/balcao/pessoa'
import { getFaceImageDataUrl } from '../../../../lib/face-image'
import { miniaturaDeDataUrl } from '../../../../lib/face/thumbnail'

const FOTO_CONFERENCIA_PX = 320

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const acesso = await abrirBalcao(req, res, 'balcao-buscar', 40, 60_000)
  if (!acesso) return

  try {
    const documento = typeof req.body?.documento === 'string' ? req.body.documento : ''
    const r = await buscarPorDocumento(acesso.event.id, documento, { comFoto: true })
    if (r.tipo === 'ambiguo') return res.status(409).json({ error: 'documento-ambiguo', message: r.mensagem })
    if (r.tipo === 'nada') {
      return res.status(404).json({ error: 'nao-encontrado', message: 'Nenhum cadastro ativo com esse documento neste evento.' })
    }
    const p = r.pessoa

    let fotoAtual: string | null = null
    try {
      const cheia = getFaceImageDataUrl(p)
      fotoAtual = cheia ? await miniaturaDeDataUrl(cheia, FOTO_CONFERENCIA_PX) : null
    } catch (e: any) {
      // Foto que não abre: o balcão existe justamente para trocá-la.
      console.error(`[balcao/buscar] foto ilegível ${p.id}: ${e?.message ?? e}`)
    }

    const evento = await prisma.event.findUnique({ where: { id: acesso.event.id }, select: { requiresApprovalForAccess: true } })
    const terminais = await estadoNosTerminais(p, null, evento?.requiresApprovalForAccess ?? true)

    // Quem consultou quem: o operador é temporário, então a consulta em si é
    // registrada, não só a troca.
    const ctx = contexto(req)
    await prisma.auditLog.create({
      data: {
        eventId: acesso.event.id,
        standId: p.standId,
        targetParticipantId: p.id,
        action: 'BALCAO_BUSCA',
        entityType: 'participant',
        entityId: p.id,
        actorType: 'balcao',
        actorIdentifier: `balcao:${acesso.tokenId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        description: `Balcão "${acesso.label}" consultou o cadastro de ${p.name}`,
        metadata: { balcaoTokenId: acesso.tokenId, operador: acesso.label },
        severity: 'INFO'
      }
    })

    return res.status(200).json({
      pessoa: {
        nome: p.name,
        stand: p.stand?.name ?? null,
        documento: documentoMascarado(p.cpf),
        aprovacao: p.approvalStatus ?? 'pending',
        temFoto: !!fotoAtual,
        fotoAtual
      },
      terminais
    })
  } catch (e: any) {
    console.error('[balcao/buscar]', e)
    return res.status(500).json({ error: 'Erro ao buscar' })
  }
}
