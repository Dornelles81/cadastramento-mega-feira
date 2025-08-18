import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { filename } = req.query
  
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const filePath = path.join(process.cwd(), 'uploads', filename)
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  // Get file stats
  const stats = fs.statSync(filePath)
  
  // Set headers
  res.setHeader('Content-Length', stats.size)
  
  // Determine content type based on extension
  const ext = path.extname(filename).toLowerCase()
  const contentTypes: { [key: string]: string } = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
  }
  
  const contentType = contentTypes[ext] || 'application/octet-stream'
  res.setHeader('Content-Type', contentType)
  
  // Stream the file
  const stream = fs.createReadStream(filePath)
  stream.pipe(res)
}