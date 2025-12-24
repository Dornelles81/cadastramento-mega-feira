const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing Expofest 2026 participants...\n');

    // Buscar evento Expofest
    const expofest = await prisma.event.findUnique({
      where: { slug: 'expofest-2026' },
      include: {
        _count: {
          select: {
            participants: true
          }
        }
      }
    });

    console.log('=== Evento Expofest 2026 ===');
    console.log('ID:', expofest?.id);
    console.log('Nome:', expofest?.name);
    console.log('Code:', expofest?.code);
    console.log('Participantes (count):', expofest?._count?.participants);

    // Buscar participantes do evento por eventId
    const participantsByEventId = await prisma.participant.findMany({
      where: {
        eventId: expofest?.id
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        eventId: true,
        eventCode: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log('\n=== Participantes por EventID ===');
    console.log('Total:', participantsByEventId.length);
    participantsByEventId.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.name}`);
      console.log(`   CPF: ${p.cpf}`);
      console.log(`   EventID: ${p.eventId}`);
      console.log(`   EventCode: ${p.eventCode}`);
      console.log(`   Cadastrado em: ${p.createdAt}`);
    });

    // Buscar participantes por eventCode
    const participantsByCode = await prisma.participant.findMany({
      where: {
        eventCode: 'EXPOFEST-2026'
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        eventId: true,
        eventCode: true
      }
    });

    console.log('\n=== Participantes por EventCode (EXPOFEST-2026) ===');
    console.log('Total:', participantsByCode.length);
    participantsByCode.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} - EventID: ${p.eventId} - EventCode: ${p.eventCode}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
