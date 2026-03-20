import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    await requireAuth(req, res)
  } catch {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  try {
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5MB
    })

    const [, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }

    const mimeType = file.mimetype || 'image/png'
    const buffer = fs.readFileSync(file.filepath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    // Clean up temp file
    try { fs.unlinkSync(file.filepath) } catch { /* ignore */ }

    return res.status(200).json({
      success: true,
      url: dataUrl
    })
  } catch (error) {
    console.error('Logo upload error:', error)
    return res.status(500).json({ error: 'Erro ao fazer upload da logo' })
  }
}
