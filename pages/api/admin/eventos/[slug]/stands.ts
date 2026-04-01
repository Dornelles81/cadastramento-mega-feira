import { NextApiRequest, NextApiResponse } from 'next';
import { invalidateStandCache } from '../../../../../lib/cache';
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma'


// API para gerenciamento de Stands por Evento (CRUD)
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'Event slug is required' });
    return;
  }

  try {
    // Verificar autenticação via NextAuth
    await requireAuth(req, res);
    // Find event by slug
    const event = await prisma.event.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true, name: true, code: true, slug: true }
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    switch (req.method) {
      case 'GET':
        await handleGet(req, res, event.id);
        break;

      case 'POST':
        await handlePost(req, res, event.id, event.code);
        break;

      case 'PUT':
        await handlePut(req, res, event.id);
        break;

      case 'DELETE':
        await handleDelete(req, res, event.id);
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    if (error.message === 'Não autenticado') {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    console.error('Event Stand API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
  }
}

// GET - Listar stands do evento ou buscar por ID
async function handleGet(req: NextApiRequest, res: NextApiResponse, eventId: string): Promise<void> {
  const { id, active } = req.query;

  // Buscar stand específico por ID (verificando que pertence ao evento)
  if (id) {
    const stand = await prisma.stand.findFirst({
      where: {
        id: id as string,
        eventId: eventId
      },
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
      res.status(404).json({ error: 'Stand not found in this event' });
      return;
    }

    res.status(200).json(stand);
    return;
  }

  // Listar todos os stands do evento
  const { withParticipants } = req.query;

  const where: any = {
    eventId: eventId,
    // Excluir stands auto-criados por campos personalizados
    // Usar OR para incluir stands com description null (NOT LIKE exclui NULL no PostgreSQL)
    OR: [
      { description: null },
      { NOT: { description: { contains: 'Auto-criado pelo campo:' } } }
    ]
  };

  if (active !== undefined) {
    where.isActive = active === 'true';
  }

  const stands = await prisma.stand.findMany({
    where,
    include: {
      _count: {
        select: { participants: true }
      },
      ...(withParticipants === 'true' ? {
        participants: {
          select: {
            id: true,
            name: true,
            cpf: true,
            email: true,
            phone: true,
            createdAt: true,
            approvalStatus: true
          },
          orderBy: { name: 'asc' }
        }
      } : {})
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

  // Get event info for the response
  const eventInfo = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, code: true, slug: true }
  });

  res.status(200).json({
    event: eventInfo,
    stands: stats,
    total: stands.length,
    active: stands.filter(s => s.isActive).length,
    full: stats.filter(s => s.isFull).length,
    withoutRegistrations: stats.filter(s => s.currentCount === 0).length
  });
}

// POST - Criar novo stand para o evento
async function handlePost(req: NextApiRequest, res: NextApiResponse, eventId: string, eventCode: string): Promise<void> {
  const {
    name,
    code,
    description,
    maxRegistrations = 3,
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

  // Verificar se o código já existe NESTE EVENTO
  const existingStand = await prisma.stand.findFirst({
    where: {
      code: code.toUpperCase(),
      eventId: eventId
    }
  });

  if (existingStand) {
    res.status(409).json({ error: 'Stand code already exists in this event' });
    return;
  }

  // Criar stand vinculado ao evento
  const stand = await prisma.stand.create({
    data: {
      name,
      code: code.toUpperCase(),
      description,
      maxRegistrations,
      eventId: eventId,
      eventCode: eventCode,
      responsibleName,
      responsibleEmail,
      responsiblePhone,
      location,
      notes: notes || null
    }
  });

  // Invalidar cache de stands
  invalidateStandCache();

  res.status(201).json({
    success: true,
    stand
  });
}

// PUT - Atualizar stand do evento
async function handlePut(req: NextApiRequest, res: NextApiResponse, eventId: string): Promise<void> {
  const { id } = req.query;

  if (!id) {
    res.status(400).json({ error: 'Stand ID is required' });
    return;
  }

  const {
    name,
    description,
    maxRegistrations,
    responsibleName,
    responsibleEmail,
    responsiblePhone,
    location,
    notes,
    isActive
  } = req.body;

  // Verificar se stand existe E pertence ao evento
  const existingStand = await prisma.stand.findFirst({
    where: {
      id: id as string,
      eventId: eventId
    },
    include: {
      _count: {
        select: { participants: true }
      }
    }
  });

  if (!existingStand) {
    res.status(404).json({ error: 'Stand not found in this event' });
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

  // Atualizar stand
  const updateData: any = {};

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (maxRegistrations !== undefined) updateData.maxRegistrations = maxRegistrations;
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

  // Invalidar cache de stands
  invalidateStandCache(id as string);

  res.status(200).json({
    success: true,
    stand
  });
}

// DELETE - Deletar stand do evento
async function handleDelete(req: NextApiRequest, res: NextApiResponse, eventId: string): Promise<void> {
  const { id } = req.query;

  if (!id) {
    res.status(400).json({ error: 'Stand ID is required' });
    return;
  }

  // Verificar se stand existe E pertence ao evento
  const existingStand = await prisma.stand.findFirst({
    where: {
      id: id as string,
      eventId: eventId
    },
    include: {
      _count: {
        select: { participants: true }
      }
    }
  });

  if (!existingStand) {
    res.status(404).json({ error: 'Stand not found in this event' });
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

  // Deletar stand
  await prisma.stand.delete({
    where: { id: id as string }
  });

  // Invalidar cache de stands
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
