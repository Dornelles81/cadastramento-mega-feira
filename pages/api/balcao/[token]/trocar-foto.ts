/**
 * POST /api/balcao/[token]/trocar-foto   { documento, faceImage, faceData, conferiu: true }
 *
 * Troca a foto de quem está NA FRENTE do operador. Três regras:
 *
 *  1. A aprovação é MANTIDA (decisão de 2026-09-28). A pessoa veio ao balcão
 *     porque a porta não abriu; derrubá-la para pendente a prenderia no portão
 *     justo quando veio resolver. O que compensa é a conferência e o rastro:
 *
 *  2. Conferência obrigatória: a troca identifica a pessoa pelo DOCUMENTO,
 *     resolvido de novo aqui no servidor — nunca por um id que o navegador
 *     guardou — e o operador declara `conferiu: true`: documento físico, rosto
 *     e foto antiga batem.
 *
 *  3. Rastro completo: `faceVersion` anterior e nova, operador (label do link),
 *     IP, aprovação no momento. É o que responde "quem trocou a foto de quem".
 *
 * A gravação é a mesma do link de edição (lib/participants/foto-nova): barreira
 * de 200 KB do terminal, cifragem, métricas da captura e envio aos terminais.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'
import { abrirBalcao, contexto } from '../../../../lib/balcao/http'
import { buscarPorDocumento } from '../../../../lib/balcao/pessoa'
import { prepararFotoNova, propagarFotoNova } from '../../../../lib/participants/foto-nova'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const acesso = await abrirBalcao(req, res, 'balcao-trocar', 20, 10 * 60_000)
  if (!acesso) return

  try {
    const { documento, faceImage, faceData, conferiu } = req.body ?? {}
    if (conferiu !== true) {
      return res.status(400).json({ error: 'conferencia-obrigatoria', message: 'Confirme que conferiu o documento e o rosto.' })
    }
    if (typeof faceImage !== 'string' || faceImage.length < 100) {
      return res.status(400).json({ error: 'foto-ausente', message: 'Tire a foto antes de salvar.' })
    }

    const r = await buscarPorDocumento(acesso.event.id, typeof documento === 'string' ? documento : '')
    if (r.tipo === 'ambiguo') return res.status(409).json({ error: 'documento-ambiguo', message: r.mensagem })
    if (r.tipo === 'nada') return res.status(404).json({ error: 'nao-encontrado', message: 'Nenhum cadastro ativo com esse documento neste evento.' })
    const p = r.pessoa

    const foto = prepararFotoNova(faceImage, faceData)
    if (!foto.ok) return res.status(foto.status).json(foto.body)

    const trocadaEm = new Date()
    const ctx = contexto(req)
    await prisma.$transaction([
      prisma.participant.update({
        where: { id: p.id },
        // SÓ a foto. `approvalStatus` fica como está, de propósito — ver (1).
        data: { ...foto.data, updatedAt: trocadaEm } as any
      }),
      prisma.auditLog.create({
        data: {
          eventId: acesso.event.id,
          standId: p.standId,
          targetParticipantId: p.id,
          action: 'BALCAO_FOTO_TROCADA',
          entityType: 'participant',
          entityId: p.id,
          actorType: 'balcao',
          actorIdentifier: `balcao:${acesso.tokenId}`,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          description: `Balcão "${acesso.label}" trocou a foto de ${p.name} (aprovação mantida: ${p.approvalStatus ?? 'pending'})`,
          metadata: {
            balcaoTokenId: acesso.tokenId,
            operador: acesso.label,
            faceVersionAntes: p.faceVersion ?? null,
            faceVersionDepois: foto.faceVersion,
            aprovacaoMantida: p.approvalStatus ?? 'pending',
            conferiuDocumento: true,
            captureMode: typeof faceData?.faceCaptureMode === 'string' ? faceData.faceCaptureMode : null
          },
          severity: 'WARNING'
        }
      })
    ])

    await propagarFotoNova(p.eventId, p.id)

    return res.status(200).json({ ok: true, trocadaEm: trocadaEm.toISOString() })
  } catch (e: any) {
    console.error('[balcao/trocar-foto]', e)
    return res.status(500).json({ error: 'Erro ao salvar a foto' })
  }
}
