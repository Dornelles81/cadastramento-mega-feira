import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { invalidateStandCache } from '../../../lib/cache';

const prisma = new PrismaClient();

// API para gerenciamento de Estandes (CRUD)
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Basic authentication check
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!authHeader || !authHeader.includes(validPassword)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        await handleGet(req, res);
        break;

      case 'POST':
        await handlePost(req, res);
        break;

      case 'PUT':
        await handlePut(req, res);
        break;

      case 'DELETE':
        await handleDelete(req, res);
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Stand API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}

// GET - Listar estandes ou buscar por ID
async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { id, code, eventCode, active } = req.query;

  // Buscar estande específico por ID
  if (id) {
    const stand = await prisma.stand.findUnique({
      where: { id: id as string },
      include: {
        participants: {
          select: {
            id: true,
            name: true,
            cpf: true,
            email: true,
            createdAt: true,
            approvalStatus: true
          }
        },
        _count: {
          select: { participants: true }
        }
      }
    });

    if (!stand) {
      res.status(404).json({ error: 'Stand not found' });
      return;
    }

    res.status(200).json(stand);
    return;
  }

  // Buscar estande por código
  if (code) {
    const stand = await prisma.stand.findUnique({
      where: { code: code as string },
      include: {
        _count: {
          select: { participants: true }
        }
      }
    });

    if (!stand) {
      res.status(404).json({ error: 'Stand not found' });
      return;
    }

    res.status(200).json(stand);
    return;
  }

  // Listar todos os estandes com filtros opcionais
  const where: any = {
    // Excluir estandes auto-criados por campos personalizados
    NOT: {
      description: {
        contains: 'Auto-criado pelo campo:'
      }
    }
  };

  if (eventCode) {
    where.eventCode = eventCode;
  }

  if (active !== undefined) {
    where.isActive = active === 'true';
  }

  const stands = await prisma.stand.findMany({
    where,
    include: {
      _count: {
        select: { participants: true }
      }
    },
    orderBy: [
      { isActive: 'desc' },
      { name: 'asc' }
    ]
  });

  // Calcular estatísticas
  const stats = stands.map(stand => ({
    ...stand,
    currentCount: stand._count.participants,
    availableSlots: stand.maxRegistrations - stand._count.participants,
    usagePercentage: (stand._count.participants / stand.maxRegistrations) * 100,
    isFull: stand._count.participants >= stand.maxRegistrations
  }));

  res.status(200).json({
    stands: stats,
    total: stands.length,
    active: stands.filter(s => s.isActive).length,
    full: stats.filter(s => s.isFull).length
  });
}

// POST - Criar novo estande
async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const {
    name,
    code,
    description,
    maxRegistrations = 3,
    eventCode,
    responsibleName,
    responsibleEmail,
    responsiblePhone,
    location,
    notes
  } = req.body;

  // Validação
  if (!name || !code) {
    res.status(400).json({ error: 'Name and code are required' });
    return;
  }

  if (maxRegistrations < 1) {
    res.status(400).json({ error: 'Max registrations must be at least 1' });
    return;
  }

  // Verificar se o código já existe
  const existingStand = await prisma.stand.findUnique({
    where: { code }
  });

  if (existingStand) {
    res.status(409).json({ error: 'Stand code already exists' });
    return;
  }

  // Criar estande
  const stand = await prisma.stand.create({
    data: {
      name,
      code: code.toUpperCase(),
      description,
      maxRegistrations,
      eventCode,
      responsibleName,
      responsibleEmail,
      responsiblePhone,
      location,
      notes: notes || null
    }
  });

  // Invalidar cache de estandes
  invalidateStandCache();

  res.status(201).json({
    success: true,
    stand
  });
}

// PUT - Atualizar estande
async function handlePut(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { id } = req.query;

  if (!id) {
    res.status(400).json({ error: 'Stand ID is required' });
    return;
  }

  const {
    name,
    description,
    maxRegistrations,
    eventCode,
    responsibleName,
    responsibleEmail,
    responsiblePhone,
    location,
    notes,
    isActive
  } = req.body;

  // Verificar se estande existe
  const existingStand = await prisma.stand.findUnique({
    where: { id: id as string },
    include: {
      _count: {
        select: { participants: true }
      }
    }
  });

  if (!existingStand) {
    res.status(404).json({ error: 'Stand not found' });
    return;
  }

  // Se tentar reduzir maxRegistrations abaixo do número atual de participantes
  if (maxRegistrations !== undefined && maxRegistrations < existingStand._count.participants) {
    res.status(400).json({
      error: 'Cannot reduce max registrations below current participant count',
      currentCount: existingStand._count.participants,
      requestedMax: maxRegistrations
    });
    return;
  }

  // Atualizar estande
  const updateData: any = {};

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (maxRegistrations !== undefined) updateData.maxRegistrations = maxRegistrations;
  if (eventCode !== undefined) updateData.eventCode = eventCode;
  if (responsibleName !== undefined) updateData.responsibleName = responsibleName;
  if (responsibleEmail !== undefined) updateData.responsibleEmail = responsibleEmail;
  if (responsiblePhone !== undefined) updateData.responsiblePhone = responsiblePhone;
  if (location !== undefined) updateData.location = location;
  if (notes !== undefined) updateData.notes = notes;
  if (isActive !== undefined) updateData.isActive = isActive;

  const stand = await prisma.stand.update({
    where: { id: id as string },
    data: updateData,
    include: {
      _count: {
        select: { participants: true }
      }
    }
  });

  // Invalidar cache de estandes
  invalidateStandCache(id as string);

  res.status(200).json({
    success: true,
    stand
  });
}

// DELETE - Deletar estande
async function handleDelete(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { id } = req.query;

  if (!id) {
    res.status(400).json({ error: 'Stand ID is required' });
    return;
  }

  // Verificar se estande existe e se tem participantes
  const existingStand = await prisma.stand.findUnique({
    where: { id: id as string },
    include: {
      _count: {
        select: { participants: true }
      }
    }
  });

  if (!existingStand) {
    res.status(404).json({ error: 'Stand not found' });
    return;
  }

  if (existingStand._count.participants > 0) {
    res.status(400).json({
      error: 'Cannot delete stand with registered participants',
      participantCount: existingStand._count.participants,
      suggestion: 'Remove or reassign participants first, or set isActive to false'
    });
    return;
  }

  // Deletar estande
  await prisma.stand.delete({
    where: { id: id as string }
  });

  // Invalidar cache de estandes
  invalidateStandCache(id as string);

  res.status(200).json({
    success: true,
    message: 'Stand deleted successfully'
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};
