import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Public API to list active stands with availability
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { eventCode } = req.query;

    // Build where clause
    const where: any = {
      isActive: true
    };

    if (eventCode) {
      where.eventCode = eventCode;
    }

    // Get all active stands with participant count
    const stands = await prisma.stand.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        maxRegistrations: true,
        location: true,
        eventCode: true,
        _count: {
          select: { participants: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Calculate availability - Return ALL active stands (including full ones)
    const availableStands = stands.map(stand => ({
      id: stand.id,
      name: stand.name,
      code: stand.code,
      description: stand.description,
      location: stand.location,
      eventCode: stand.eventCode,
      maxRegistrations: stand.maxRegistrations,
      currentCount: stand._count.participants,
      availableSlots: stand.maxRegistrations - stand._count.participants,
      isFull: stand._count.participants >= stand.maxRegistrations,
      usagePercentage: (stand._count.participants / stand.maxRegistrations) * 100
    }))
    // Don't filter - show all stands, even full ones
    .sort((a, b) => {
      // Sort by: non-full first, then by available slots descending
      if (a.isFull !== b.isFull) return a.isFull ? 1 : -1;
      return b.availableSlots - a.availableSlots;
    });

    res.status(200).json({
      stands: availableStands,
      total: availableStands.length
    });
  } catch (error: any) {
    console.error('Public stands API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Erro ao carregar estandes'
    });
  } finally {
    await prisma.$disconnect();
  }
}
