import { NextApiRequest, NextApiResponse } from 'next';
import type { Session } from 'next-auth';
import { invalidateStandCache } from '../../../../../lib/cache';
import { withApiAuth, ADMIN_ROLES, hasEventPermission } from '../../../../../lib/api-auth';
import { prisma } from '../../../../../lib/prisma'
import { occupiedSlotsRelationWhere } from '../../../../../lib/stand-access/occupancy'
import { visibleParticipantsRelationWhere } from '../../../../../lib/participants/visibility'
import { buscarRemocoes, montarRemocao } from '../../../../../lib/participants/removal-badge'


// API para gerenciamento de Stands por Evento (CRUD)
//
// ── AUTORIZAÇÃO ────────────────────────────────────────────────────────────
// Até 04/09/2026 esta rota chamava só `requireAuth`, que apenas confirma que
// existe sessão — sem role e sem vínculo com o evento do slug. Qualquer conta
// autenticada, de qualquer role, lia com `?withParticipants=true` o nome, CPF,
// e-mail e telefone de todos os participantes de QUALQUER evento (bastava
// trocar o slug na URL), criava e alterava stands, e deletava os que estivessem
// vazios. Agora: ADMIN_ROLES no wrapper + permissão POR EVENTO, por método.
async function handler(req: NextApiRequest, res: NextApiResponse, session: Session): Promise<void> {
  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'Event slug is required' });
    return;
  }

  try {
    // Find event by slug
    const event = await prisma.event.findUnique({
      where: { slug: slug.toLowerCase() },
      // startDate + registrationDeadline alimentam o prazo recomendado exibido
      // no convite de cadastro (lib/event/registration-deadline.ts).
      select: { id: true, name: true, code: true, slug: true, startDate: true, registrationDeadline: true }
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Leitura exige canView; escrita exige canManageStands. A separação importa:
    // o GET com ?withParticipants=true devolve CPF, então não pode cair na mesma
    // régua de "quem edita stand"; e criar/alterar/excluir stand é exatamente o
    // que `canManageStands` existe para governar (não `canDelete`, que é do
    // domínio de participante). `hasEventPermission` já devolve true p/ SUPER_ADMIN.
    const permissaoNecessaria = req.method === 'GET' ? 'canView' : 'canManageStands';
    if (!hasEventPermission(session, event.slug, permissaoNecessaria)) {
      res.status(403).json({
        error: req.method === 'GET'
          ? 'Sem permissão para ver os stands deste evento'
          : 'Sem permissão para gerenciar os stands deste evento'
      });
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
    // O 401 saía daqui porque `requireAuth` sinalizava por exceção; quem responde
    // 401/403 agora é o wrapper, antes de o handler rodar.
    console.error('Event Stand API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
  }
}

// 401 sem sessão, 403 fora de ADMIN_ROLES (SUPER_ADMIN, ADMIN, EVENT_ADMIN).
export default withApiAuth(handler, { roles: ADMIN_ROLES });

// GET - Listar stands do evento ou buscar por ID
async function handleGet(req: NextApiRequest, res: NextApiResponse, eventId: string): Promise<void> {
  const { id, active, includeRemoved } = req.query;

  // Buscar stand específico por ID (verificando que pertence ao evento)
  if (id) {
    // Modal "Editar stand": por padrão só quem está cadastrado agora (mesma
    // régua da lista abaixo e da trava do DELETE). Com ?includeRemoved=1 o
    // toggle traz também os excluídos pelo gestor — é o que explica ao admin
    // por que aquele CPF continua bloqueado para recadastro.
    const mostrarRemovidos = includeRemoved === '1' || includeRemoved === 'true';

    const stand = await prisma.stand.findFirst({
      where: {
        id: id as string,
        eventId: eventId
      },
      include: {
        participants: {
          ...(mostrarRemovidos ? {} : { where: visibleParticipantsRelationWhere() }),
          select: {
            id: true,
            name: true,
            cpf: true,
            email: true,
            createdAt: true,
            approvalStatus: true,
            // Badge de removido. Note que nem aqui nem no toggle trafega foto,
            // biometria ou documento — o modal nunca recebeu esses campos.
            status: true,
            removedAt: true,
            removedBy: true
          }
        },
        _count: {
          // Contagem do cabeçalho é sempre a de cadastrados: não infla quando o
          // admin liga o toggle
          select: { participants: { where: visibleParticipantsRelationWhere() } }
        }
      }
    });

    if (!stand) {
      res.status(404).json({ error: 'Stand not found in this event' });
      return;
    }

    // Ator/data da exclusão a partir do audit log, só para os removidos da lista
    const remocoes = await buscarRemocoes(
      stand.participants.filter(p => p.status === 'removed').map(p => p.id)
    );
    const participants = stand.participants.map(p => ({
      ...p,
      removal: p.status === 'removed' ? montarRemocao(p, remocoes) : null
    }));

    res.status(200).json({ ...stand, participants });
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
        // Ocupação canônica (Fase 7): ativos + slots travados até a virada
        select: {
          participants: { where: occupiedSlotsRelationWhere() }
        }
      },
      accessTokens: {
        where: { revokedAt: null },
        select: { scope: true, createdAt: true, expiresAt: true, lastUsedAt: true },
        orderBy: { createdAt: 'desc' }
      },
      ...(withParticipants === 'true' ? {
        participants: {
          where: { status: 'active', isDeleted: false },
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
  const now = new Date();
  const stats = stands.map(({ accessTokens, ...stand }) => {
    // Tokens ativos e não expirados (já ordenados createdAt desc → o 1º de
    // cada scope é o mais recente). Fatia 4: flags por scope.
    const live = accessTokens.filter((t) => !t.expiresAt || t.expiresAt >= now);
    const reg = live.find((t) => t.scope === 'register');
    const man = live.find((t) => t.scope === 'manage');
    return {
      ...stand,
      currentCount: stand._count.participants,
      availableSlots: stand.maxRegistrations - stand._count.participants,
      usagePercentage: (stand._count.participants / stand.maxRegistrations) * 100,
      isFull: stand._count.participants >= stand.maxRegistrations,
      // Flags por scope (Fatia 4)
      hasRegisterLink: !!reg,
      hasManageLink: !!man,
      registerGeneratedAt: reg?.createdAt ?? null,
      registerLastUsedAt: reg?.lastUsedAt ?? null,
      manageGeneratedAt: man?.createdAt ?? null,
      manageLastUsedAt: man?.lastUsedAt ?? null,
      // Bridge p/ a UI atual (remover na Fatia 6, quando a UI usar os flags por scope)
      hasActiveLink: !!reg || !!man,
      linkGeneratedAt: (man ?? reg)?.createdAt ?? null,
      linkLastUsedAt: (man ?? reg)?.lastUsedAt ?? null
    };
  });

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
        select: {
          participants: { where: occupiedSlotsRelationWhere() }
        }
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
        // Mesma régua do resto do arquivo (a UI recarrega a lista depois do PUT,
        // então isto é só coerência do payload — não muda comportamento).
        select: { participants: { where: visibleParticipantsRelationWhere() } }
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
    }
  });

  if (!existingStand) {
    res.status(404).json({ error: 'Stand not found in this event' });
    return;
  }

  // Trava: só participantes ATIVOS bloqueiam (== "gente dentro"). Os 'removed'
  // (soft-remove pelo responsável) já saíram e tiveram a biometria limpa — não
  // bloqueiam e ficam com standId=null (FK onDelete: SetNull) ao deletar o stand.
  // Casa com a lista do modal (que exibe só status:'active') → excluir todos os
  // visíveis zera a contagem e libera o stand.
  const activeCount = await prisma.participant.count({
    where: { standId: id as string, status: 'active', isDeleted: false }
  });

  if (activeCount > 0) {
    res.status(400).json({
      error: 'Cannot delete stand with registered participants',
      message: 'Não é possível excluir um stand que ainda tem participantes cadastrados. Exclua os participantes pela lista (no botão Editar do stand) e tente novamente.',
      participantCount: activeCount
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
