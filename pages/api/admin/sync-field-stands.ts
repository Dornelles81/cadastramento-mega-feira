import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Verify auth token
function verifyToken(token: string): boolean {
  try {
    const SECRET_KEY = process.env.SECRET_KEY || 'mega-feira-secret-key-2025';
    const now = Date.now();

    // Check last 24 hours of possible tokens
    for (let i = 0; i < 24; i++) {
      const timestamp = Math.floor((now - (i * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const data = `${timestamp}-${SECRET_KEY}`;
      const validToken = crypto.createHash('sha256').update(data).digest('hex');
      if (token === validToken) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

// API to sync field options with Stand table when limits are enabled
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  try {
    const { fieldName, options, validation, eventCode } = req.body;

    // Check if this field has limits enabled
    if (!validation?.hasLimits || !validation?.optionLimits || !options) {
      res.status(200).json({
        success: true,
        message: 'No limits to sync',
        synced: 0
      });
      return;
    }

    const syncResults = [];

    // Process each option
    for (const option of options) {
      if (!option || option.trim() === '') continue;

      const limit = validation.optionLimits[option] || 3;
      const standCode = `${fieldName}_${option}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      // Check if stand already exists
      const existingStand = await prisma.stand.findUnique({
        where: { code: standCode },
        include: {
          _count: {
            select: { participants: true }
          }
        }
      });

      if (existingStand) {
        // Update existing stand
        // Only update if new limit is >= current participant count
        if (limit >= existingStand._count.participants) {
          await prisma.stand.update({
            where: { code: standCode },
            data: {
              name: option,
              maxRegistrations: limit,
              eventCode: eventCode || null,
              isActive: true
            }
          });

          syncResults.push({
            option,
            code: standCode,
            action: 'updated',
            limit,
            currentCount: existingStand._count.participants
          });
        } else {
          syncResults.push({
            option,
            code: standCode,
            action: 'skipped',
            reason: `Cannot reduce limit below current count (${existingStand._count.participants})`,
            limit,
            currentCount: existingStand._count.participants
          });
        }
      } else {
        // Create new stand
        await prisma.stand.create({
          data: {
            name: option,
            code: standCode,
            description: `Auto-criado pelo campo: ${fieldName}`,
            maxRegistrations: limit,
            eventCode: eventCode || null,
            isActive: true
          }
        });

        syncResults.push({
          option,
          code: standCode,
          action: 'created',
          limit
        });
      }
    }

    // Find stands that were created from this field but option was removed
    const currentCodes = options
      .filter((opt: string) => opt && opt.trim() !== '')
      .map((opt: string) => `${fieldName}_${opt}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));

    const standsToDeactivate = await prisma.stand.findMany({
      where: {
        code: {
          startsWith: `${fieldName}_`.toUpperCase()
        },
        code: {
          notIn: currentCodes
        }
      },
      include: {
        _count: {
          select: { participants: true }
        }
      }
    });

    for (const stand of standsToDeactivate) {
      // Only deactivate if no participants
      if (stand._count.participants === 0) {
        await prisma.stand.update({
          where: { id: stand.id },
          data: { isActive: false }
        });

        syncResults.push({
          option: stand.name,
          code: stand.code,
          action: 'deactivated',
          reason: 'Option removed from field'
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Synchronized ${syncResults.length} stands`,
      results: syncResults,
      synced: syncResults.filter(r => r.action === 'created' || r.action === 'updated').length
    });

  } catch (error: any) {
    console.error('Stand sync error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}
