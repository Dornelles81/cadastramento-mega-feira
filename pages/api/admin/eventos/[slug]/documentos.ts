import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'
import { requireAuth, isSuperAdmin } from '../../../../../lib/auth'

const prisma = new PrismaClient()

/**
 * API: Gerenciar configurações de documentos por evento
 *
 * GET    - Listar documentos do evento
 * POST   - Criar novo documento
 * PUT    - Atualizar documento existente
 * DELETE - Deletar documento
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Require authentication
    const session = await requireAuth(req, res)

    // Check if super admin (only super admins can manage documents)
    if (!isSuperAdmin(session)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas Super Admin.' })
    }

    const { slug } = req.query
    const { id } = req.query // For PUT and DELETE

    if (typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug inválido' })
    }

    // Find event
    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' })
    }

    // ========================================================================
    // GET - List all documents for this event
    // ========================================================================
    if (req.method === 'GET') {
      const documents = await prisma.documentConfig.findMany({
        where: {
          eventId: event.id,
          active: true
        },
        orderBy: {
          order: 'asc'
        }
      })

      return res.status(200).json({
        success: true,
        documents,
        event: {
          id: event.id,
          name: event.name,
          slug: event.slug
        }
      })
    }

    // ========================================================================
    // POST - Create new document
    // ========================================================================
    if (req.method === 'POST') {
      const {
        documentType,
        label,
        description,
        required,
        enableOCR,
        acceptedFormats,
        maxSizeMB,
        order,
        icon,
        helpText
      } = req.body

      if (!documentType || !label) {
        return res.status(400).json({ error: 'Tipo e label são obrigatórios' })
      }

      const newDocument = await prisma.documentConfig.create({
        data: {
          eventId: event.id,
          documentType,
          label,
          description,
          required: required || false,
          enableOCR: enableOCR || false,
          acceptedFormats: acceptedFormats || ['jpg', 'jpeg', 'png', 'pdf'],
          maxSizeMB: maxSizeMB || 5,
          order: order || 0,
          icon,
          helpText,
          active: true
        }
      })

      // Create audit log
      await prisma.auditLog.create({
        data: {
          eventId: event.id,
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: 'CREATE',
          entityType: 'document_config',
          entityId: newDocument.id,
          description: `Documento "${label}" criado para evento ${event.name}`,
          newData: newDocument as any,
          severity: 'INFO'
        }
      })

      return res.status(201).json({
        success: true,
        document: newDocument,
        message: 'Documento criado com sucesso'
      })
    }

    // ========================================================================
    // PUT - Update existing document
    // ========================================================================
    if (req.method === 'PUT') {
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'ID do documento é obrigatório' })
      }

      const {
        documentType,
        label,
        description,
        required,
        enableOCR,
        acceptedFormats,
        maxSizeMB,
        order,
        icon,
        helpText,
        active
      } = req.body

      // Verify document belongs to this event
      const existingDocument = await prisma.documentConfig.findUnique({
        where: { id }
      })

      if (!existingDocument || existingDocument.eventId !== event.id) {
        return res.status(404).json({ error: 'Documento não encontrado' })
      }

      const updatedDocument = await prisma.documentConfig.update({
        where: { id },
        data: {
          ...(documentType && { documentType }),
          ...(label && { label }),
          ...(description !== undefined && { description }),
          ...(typeof required === 'boolean' && { required }),
          ...(typeof enableOCR === 'boolean' && { enableOCR }),
          ...(acceptedFormats && { acceptedFormats }),
          ...(maxSizeMB && { maxSizeMB }),
          ...(typeof order === 'number' && { order }),
          ...(icon !== undefined && { icon }),
          ...(helpText !== undefined && { helpText }),
          ...(typeof active === 'boolean' && { active }),
          updatedAt: new Date()
        }
      })

      // Create audit log
      await prisma.auditLog.create({
        data: {
          eventId: event.id,
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: 'UPDATE',
          entityType: 'document_config',
          entityId: updatedDocument.id,
          description: `Documento "${updatedDocument.label}" atualizado`,
          previousData: existingDocument as any,
          newData: updatedDocument as any,
          severity: 'INFO'
        }
      })

      return res.status(200).json({
        success: true,
        document: updatedDocument,
        message: 'Documento atualizado com sucesso'
      })
    }

    // ========================================================================
    // DELETE - Delete document
    // ========================================================================
    if (req.method === 'DELETE') {
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'ID do documento é obrigatório' })
      }

      // Verify document belongs to this event
      const existingDocument = await prisma.documentConfig.findUnique({
        where: { id }
      })

      if (!existingDocument || existingDocument.eventId !== event.id) {
        return res.status(404).json({ error: 'Documento não encontrado' })
      }

      // Soft delete (mark as inactive)
      await prisma.documentConfig.update({
        where: { id },
        data: {
          active: false,
          updatedAt: new Date()
        }
      })

      // Create audit log
      await prisma.auditLog.create({
        data: {
          eventId: event.id,
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: 'DELETE',
          entityType: 'document_config',
          entityId: id,
          description: `Documento "${existingDocument.label}" removido`,
          previousData: existingDocument as any,
          severity: 'WARNING'
        }
      })

      return res.status(200).json({
        success: true,
        message: 'Documento removido com sucesso'
      })
    }

    return res.status(405).json({ error: 'Método não permitido' })
  } catch (error: any) {
    console.error('Error in /api/admin/eventos/[slug]/documentos:', error)

    if (error.message === 'Não autenticado') {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    return res.status(500).json({
      error: 'Erro ao processar requisição',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  } finally {
    await prisma.$disconnect()
  }
}
