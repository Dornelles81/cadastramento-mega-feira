import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB max
    })

    const [fields, files] = await form.parse(req)
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const originalName = file.originalFilename || 'file'
    const extension = path.extname(originalName)
    const baseName = path.basename(originalName, extension)
    const uniqueName = `${baseName}_${timestamp}${extension}`
    
    // Move file to final location
    const finalPath = path.join(uploadDir, uniqueName)
    fs.renameSync(file.filepath, finalPath)

    // Return file info
    return res.status(200).json({
      success: true,
      file: {
        filename: uniqueName,
        originalName: originalName,
        size: file.size,
        mimetype: file.mimetype,
        path: `/uploads/${uniqueName}`
      }
    })
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: 'Failed to upload file' })
  }
}