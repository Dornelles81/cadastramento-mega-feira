import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET active document fields for public form
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')
    
    // Get ONLY active documents (required field controls if user must fill it)
    const where: any = {
      active: true
    }

    // If eventCode is provided, get event-specific documents
    if (eventCode) {
      where.OR = [
        { eventCode: null, active: true },
        { eventCode: eventCode, active: true }
      ]
      delete where.active
    } else {
      where.eventCode = null
    }
    
    const documents = await prisma.documentConfig.findMany({
      where,
      orderBy: { order: 'asc' },
      select: {
        documentType: true,
        label: true,
        description: true,
        required: true,
        enableOCR: true,
        acceptedFormats: true,
        maxSizeMB: true,
        order: true
      }
    })

    // Ensure acceptedFormats is always an array
    const normalizedDocuments = documents.map(doc => ({
      ...doc,
      acceptedFormats: Array.isArray(doc.acceptedFormats)
        ? doc.acceptedFormats
        : (doc.acceptedFormats
          ? ['jpg', 'jpeg', 'png']
          : ['jpg', 'jpeg', 'png'])
    }))

    return NextResponse.json({ documents: normalizedDocuments })
  } catch (error) {
    console.error('Error fetching document fields:', error)
    return NextResponse.json(
      { documents: [] },
      { status: 200 }
    )
  }
}