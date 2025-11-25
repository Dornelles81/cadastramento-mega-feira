import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET active document fields for public form
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventCode = searchParams.get('eventCode')

    console.log('📄 document-fields request:', { eventCode })

    // If eventCode is provided, get the event to find its ID
    // Suporta tanto slug (expofest-2026) quanto code (EXPOFEST-2026)
    let eventId: string | undefined = undefined

    if (eventCode) {
      // Primeiro tentar pelo slug (exato, minúsculas)
      let event = await prisma.event.findUnique({
        where: { slug: eventCode.toLowerCase() },
        select: { id: true, name: true, code: true, slug: true }
      })

      // Se não encontrar pelo slug, tentar pelo code (maiúsculas)
      if (!event) {
        event = await prisma.event.findUnique({
          where: { code: eventCode.toUpperCase() },
          select: { id: true, name: true, code: true, slug: true }
        })
      }

      console.log('🔍 Found event for documents:', event)
      eventId = event?.id
    }

    console.log('🎯 Using eventId for documents:', eventId)

    // Get ONLY active documents for this specific event
    // Each event is completely isolated - ONLY event-specific documents, NOT global ones
    // If no event is specified, return global documents
    const where: any = {
      active: true,
      eventId: eventId || null // ONLY event-specific OR global (NOT both)
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
        order: true,
        icon: true,
        helpText: true
      }
    })

    console.log('📦 Found document configs:', documents.length, documents.map(d => ({
      type: d.documentType,
      label: d.label,
      ocr: d.enableOCR,
      required: d.required
    })))

    // Ensure acceptedFormats is always an array
    const normalizedDocuments = documents.map(doc => ({
      ...doc,
      acceptedFormats: Array.isArray(doc.acceptedFormats)
        ? doc.acceptedFormats
        : (doc.acceptedFormats
          ? ['jpg', 'jpeg', 'png']
          : ['jpg', 'jpeg', 'png'])
    }))

    // Return with no-cache headers to prevent browser caching
    return NextResponse.json(
      { documents: normalizedDocuments },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error) {
    console.error('Error fetching document fields:', error)
    return NextResponse.json(
      { documents: [] },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}