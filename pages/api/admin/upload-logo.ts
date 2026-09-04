import { NextApiRequest, NextApiResponse } from 'next'
import { withApiAuth } from '../../../lib/api-auth'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: {
    bodyParser: false,
  },
}

/**
 * Converte a logo enviada em data URL (não grava em disco — na Vercel o
 * filesystem é efêmero). O retorno vai para `EventConfig.logoUrl`.
 *
 * ── AUTORIZAÇÃO ────────────────────────────────────────────────────────────
 * Exigia apenas `requireAuth`, que só confirma que existe sessão: qualquer
 * conta autenticada, de qualquer role, postava 5 MB aqui. É SUPER_ADMIN e não
 * ADMIN_ROLES porque os dois únicos consumidores são telas de super
 * (/admin/super/eventos/novo e /admin/super/eventos/[slug]/editar) e as APIs
 * irmãs que gravam o evento — eventos/create.ts e eventos/[slug].ts — já usam
 * a mesma régua. Uma trava mais frouxa que a do endpoint que consome o
 * resultado não protegeria nada.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
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

// 401 sem sessão, 403 para qualquer role que não seja SUPER_ADMIN.
export default withApiAuth(handler, { roles: ['SUPER_ADMIN'] })
