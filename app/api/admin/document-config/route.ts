import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET all document configurations
export async function GET(request: NextRequest) {
  try {
    const documents = await prisma.documentConfig.findMany({
      orderBy: { order: 'asc' }
    })
    
    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Error fetching document configs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch document configurations' },
      { status: 500 }
    )
  }
}

// POST create or update document configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      id,
      documentType, 
      label, 
      description,
      required, 
      enableOCR,
      acceptedFormats,
      maxSizeMB,
      order,
      active,
      eventCode
    } = body

    if (id) {
      // Update existing
      const updated = await prisma.documentConfig.update({
        where: { id },
        data: {
          documentType,
          label,
          description,
          required,
          enableOCR,
          acceptedFormats,
          maxSizeMB,
          order,
          active,
          eventCode
        }
      })
      return NextResponse.json({ document: updated })
    } else {
      // Create new
      const created = await prisma.documentConfig.create({
        data: {
          documentType,
          label,
          description,
          required,
          enableOCR,
          acceptedFormats: acceptedFormats || ["jpg", "jpeg", "png", "pdf"],
          maxSizeMB: maxSizeMB || 5,
          order,
          active: active !== undefined ? active : true,
          eventCode
        }
      })
      return NextResponse.json({ document: created })
    }
  } catch (error: any) {
    console.error('Error saving document config:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Document type already exists' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to save document configuration' },
      { status: 500 }
    )
  }
}

// DELETE document configuration
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      )
    }

    await prisma.documentConfig.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document config:', error)
    return NextResponse.json(
      { error: 'Failed to delete document configuration' },
      { status: 500 }
    )
  }
}

// Initialize default documents
export async function PUT(request: NextRequest) {
  try {
    const defaultDocuments = [
      {
        documentType: 'rg',
        label: 'RG (Carteira de Identidade)',
        description: 'Envie foto frente e verso do RG',
        required: false,
        enableOCR: true,
        acceptedFormats: ['jpg', 'jpeg', 'png'],
        maxSizeMB: 5,
        order: 1,
        active: true
      },
      {
        documentType: 'cnh',
        label: 'CNH (Carteira de Motorista)',
        description: 'Envie foto da CNH aberta',
        required: false,
        enableOCR: true,
        acceptedFormats: ['jpg', 'jpeg', 'png'],
        maxSizeMB: 5,
        order: 2,
        active: true
      },
      {
        documentType: 'cpf_doc',
        label: 'Documento com CPF',
        description: 'Qualquer documento oficial com CPF',
        required: false,
        enableOCR: true,
        acceptedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
        maxSizeMB: 5,
        order: 3,
        active: true
      },
      {
        documentType: 'foto_3x4',
        label: 'Foto 3x4',
        description: 'Foto tipo documento',
        required: false,
        enableOCR: false,
        acceptedFormats: ['jpg', 'jpeg', 'png'],
        maxSizeMB: 2,
        order: 4,
        active: false
      },
      {
        documentType: 'comprovante_residencia',
        label: 'Comprovante de Residência',
        description: 'Conta de luz, água ou telefone',
        required: false,
        enableOCR: false,
        acceptedFormats: ['jpg', 'jpeg', 'png', 'pdf'],
        maxSizeMB: 10,
        order: 5,
        active: false
      }
    ]

    // Create default documents if they don't exist
    for (const doc of defaultDocuments) {
      await prisma.documentConfig.upsert({
        where: { documentType: doc.documentType },
        update: {},
        create: doc as any
      })
    }
    
    const documents = await prisma.documentConfig.findMany({
      orderBy: { order: 'asc' }
    })
    
    return NextResponse.json({ 
      success: true,
      message: 'Default documents initialized',
      documents 
    })
  } catch (error) {
    console.error('Error initializing documents:', error)
    return NextResponse.json(
      { error: 'Failed to initialize documents' },
      { status: 500 }
    )
  }
}