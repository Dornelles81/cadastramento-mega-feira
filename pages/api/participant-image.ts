import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'
import { withApiAuth, OPERATOR_ROLES } from '../../lib/api-auth'
import { getFaceImageDataUrl } from '../../lib/face-image'

/**
 * Retorna a foto facial de um participante (decriptada) para usuários
 * autenticados (admins e operadores de portaria).
 *
 * GET /api/participant-image?id=<participantId>
 * Resposta: { imageUrl: string, type: 'url' } | placeholder SVG
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid participant ID' })
    }

    const participant = await prisma.participant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        faceImageUrl: true,
        faceData: true
      }
    })

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    const imageUrl = getFaceImageDataUrl(participant)

    if (imageUrl) {
      // Imagem é dado biométrico: nunca cachear em proxies/compartilhado
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).json({ imageUrl, type: 'url' })
    }

    // Sem imagem: placeholder com as iniciais
    const initials = participant.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e5e7eb"/><text x="60" y="72" font-family="sans-serif" font-size="40" fill="#6b7280" text-anchor="middle">${initials}</text></svg>`
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    return res.status(200).json({ imageUrl: dataUrl, type: 'placeholder' })
  } catch (error) {
    console.error('Error fetching participant image:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withApiAuth(handler, { roles: OPERATOR_ROLES })
