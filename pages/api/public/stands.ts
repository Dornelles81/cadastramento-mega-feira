import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { cache, CacheTTL } from '../../../lib/cache';

const prisma = new PrismaClient();

// Public API to list active stands with availability
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { eventCode } = req.query;

    // Cache key baseado no eventCode
    const cacheKey = `stands:public:${eventCode || 'all'}`;

    // Tentar buscar do cache
    const result = await cache.getOrSet(
      cacheKey,
      async () => {
        // Build where clause
        const where: any = {
          isActive: true,
          // Excluir stands auto-criados por campos personalizados
          NOT: {
            description: {
              contains: 'Auto-criado pelo campo:'
            }
          }
        };

        // Se eventCode foi fornecido, buscar o eventId correspondente
        // Suporta tanto slug (expofest-2026) quanto code (EXPOFEST-2026)
        if (eventCode) {
          const eventCodeStr = eventCode as string;
          console.log('🔍 Buscando evento com código/slug:', eventCodeStr);

          // Primeiro tentar pelo slug (exato, minúsculas)
          let event = await prisma.event.findUnique({
            where: { slug: eventCodeStr.toLowerCase() },
            select: { id: true, name: true, code: true, slug: true }
          });

          // Se não encontrar pelo slug, tentar pelo code (maiúsculas)
          if (!event) {
            event = await prisma.event.findUnique({
              where: { code: eventCodeStr.toUpperCase() },
              select: { id: true, name: true, code: true, slug: true }
            });
          }

          console.log('📅 Evento encontrado:', event);

          if (event) {
            where.eventId = event.id;
            console.log('✅ Filtrando stands por eventId:', event.id);
          } else {
            console.log('❌ Evento não encontrado, nenhum stand será retornado');
            // Se o evento não existe, não retornar nenhum stand
            where.eventId = 'non-existent';
          }
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

        console.log('🏪 Stands encontrados:', stands.length);
        return stands;
      },
      CacheTTL.MEDIUM // 5 minutos
    );

    const stands = result;
    console.log('📦 Retornando stands (incluindo cache):', stands.length);

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
      message: 'Erro ao carregar stands'
    });
  } finally {
    await prisma.$disconnect();
  }
}
