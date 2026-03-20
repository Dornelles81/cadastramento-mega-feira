import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'

export const config = {
  api: {
    bodyParser: false,
  },
}

const logosDir = path.join(process.cwd(), 'public', 'uploads', 'logos')

if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true })
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
      uploadDir: logosDir,
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
    })

    const [, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }

    const timestamp = Date.now()
    const originalName = file.originalFilename || 'logo'
    const extension = path.extname(originalName)
    const baseName = path.basename(originalName, extension)
      .replace(/[^a-zA-Z0-9]/g, '_')
    const uniqueName = `${baseName}_${timestamp}${extension}`

    const finalPath = path.join(logosDir, uniqueName)
    fs.renameSync(file.filepath, finalPath)

    return res.status(200).json({
      success: true,
      url: `/uploads/logos/${uniqueName}`
    })
  } catch (error) {
    console.error('Logo upload error:', error)
    return res.status(500).json({ error: 'Erro ao fazer upload da logo' })
  }
}
