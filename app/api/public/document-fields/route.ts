import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET active document fields for public form
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')
    
    // Get active document configurations
    const where: any = {
      active: true
    }
    
    // If eventCode is provided, get event-specific documents
    if (eventCode) {
      where.OR = [
        { eventCode: null },
        { eventCode: eventCode }
      ]
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
    
    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Error fetching document fields:', error)
    return NextResponse.json(
      { documents: [] },
      { status: 200 }
    )
  }
}