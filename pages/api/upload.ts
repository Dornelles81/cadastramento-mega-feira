import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { rateLimitOrReject } from '../../lib/rate-limit'

export const config = {
  api: {
    bodyParser: false,
  },
}

const uploadDir = path.join(process.cwd(), 'uploads')

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Tipos permitidos (documentos do cadastro público)
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf']

// Assinaturas de arquivo (magic bytes) — não confiar no MIME do cliente
const MAGIC_BYTES: Array<{ ext: string[]; bytes: number[] }> = [
  { ext: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { ext: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ['.pdf'], bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
]

function matchesMagicBytes(filePath: string, extension: string): boolean {
  const header = Buffer.alloc(8)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, header, 0, 8, 0)
  } finally {
    fs.closeSync(fd)
  }
  return MAGIC_BYTES.some(
    (sig) =>
      sig.ext.includes(extension) &&
      sig.bytes.every((b, i) => header[i] === b)
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Endpoint público (documentos do cadastro): limitar abuso
  if (!rateLimitOrReject(req, res, 'upload', 20, 10 * 60 * 1000)) {
    return
  }

  try {
    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB max
      maxFiles: 1,
    })

    const [fields, files] = await form.parse(req)

    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const originalName = file.originalFilename || 'file'
    const extension = path.extname(originalName).toLowerCase()

    // Validar extensão e conteúdo real do arquivo
    if (!ALLOWED_EXTENSIONS.includes(extension) || !matchesMagicBytes(file.filepath, extension)) {
      fs.unlinkSync(file.filepath)
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Apenas arquivos JPG, PNG ou PDF são aceitos.',
      })
    }

    // Nome aleatório, sem dados do nome original (evita enumeração e injeção de caminho)
    const uniqueName = `${crypto.randomUUID()}${extension}`
    const finalPath = path.join(uploadDir, uniqueName)
    fs.renameSync(file.filepath, finalPath)

    return res.status(200).json({
      success: true,
      file: {
        filename: uniqueName,
        originalName: originalName,
        size: file.size,
        mimetype: file.mimetype,
        path: `/api/uploads/${uniqueName}`,
      },
    })
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: 'Failed to upload file' })
  }
}
