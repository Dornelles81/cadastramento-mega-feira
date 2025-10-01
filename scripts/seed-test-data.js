const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedTestData() {
  console.log('🌱 Seeding test data...');

  try {
    // Create test participants
    const participants = [
      {
        name: 'João Silva',
        cpf: '123.456.789-00',
        email: 'joao@email.com',
        phone: '(11) 99999-1234',
        eventCode: 'MEGA-FEIRA-2025',
        consentAccepted: true,
        consentDate: new Date(),
        consentIp: '192.168.1.1',
        captureQuality: 0.95,
        faceImageUrl: 'https://example.com/face1.jpg',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: 'admin',
        hikCentralSyncStatus: 'pending',
        customData: {
          empresa: 'Tech Solutions',
          cargo: 'Desenvolvedor'
        }
      },
      {
        name: 'Maria Santos',
        cpf: '987.654.321-00',
        email: 'maria@email.com',
        phone: '(11) 98888-5678',
        eventCode: 'MEGA-FEIRA-2025',
        consentAccepted: true,
        consentDate: new Date(),
        consentIp: '192.168.1.2',
        captureQuality: 0.92,
        faceImageUrl: 'https://example.com/face2.jpg',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: 'admin',
        hikCentralSyncStatus: 'pending',
        customData: {
          empresa: 'Marketing Plus',
          cargo: 'Gerente'
        }
      },
      {
        name: 'Carlos Oliveira',
        cpf: '456.789.123-00',
        email: 'carlos@email.com',
        phone: '(11) 97777-9012',
        eventCode: 'MEGA-FEIRA-2025',
        consentAccepted: true,
        consentDate: new Date(),
        consentIp: '192.168.1.3',
        captureQuality: 0.88,
        faceImageUrl: 'https://example.com/face3.jpg',
        approvalStatus: 'pending',
        hikCentralSyncStatus: 'pending',
        customData: {
          empresa: 'Sales Corp',
          cargo: 'Vendedor'
        }
      },
      {
        name: 'Ana Costa',
        cpf: '321.654.987-00',
        email: 'ana@email.com',
        phone: '(11) 96666-3456',
        eventCode: 'MEGA-FEIRA-2025',
        consentAccepted: true,
        consentDate: new Date(),
        consentIp: '192.168.1.4',
        captureQuality: 0.91,
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: 'admin',
        hikCentralSyncStatus: 'synced',
        hikCentralPersonId: 'HIK-001',
        hikCentralSyncedAt: new Date(),
        customData: {
          empresa: 'Design Studio',
          cargo: 'Designer'
        }
      },
      {
        name: 'Pedro Mendes',
        cpf: '789.123.456-00',
        email: 'pedro@email.com',
        phone: '(11) 95555-7890',
        eventCode: 'MEGA-FEIRA-2025',
        consentAccepted: true,
        consentDate: new Date(),
        consentIp: '192.168.1.5',
        captureQuality: 0.87,
        faceImageUrl: 'https://example.com/face5.jpg',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: 'admin',
        hikCentralSyncStatus: 'failed',
        hikCentralErrorMsg: 'Connection timeout',
        customData: {
          empresa: 'Logistics Inc',
          cargo: 'Coordenador'
        }
      }
    ];

    // Check for existing participants
    for (const participant of participants) {
      const existing = await prisma.participant.findUnique({
        where: { cpf: participant.cpf }
      });

      if (existing) {
        console.log(`⚠️ Participant with CPF ${participant.cpf} already exists, skipping...`);
      } else {
        const created = await prisma.participant.create({
          data: participant
        });
        console.log(`✅ Created participant: ${created.name} (${created.cpf})`);
      }
    }

    // Create some audit logs
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entityType: 'participant',
        entityId: 'test-001',
        adminUser: 'admin',
        adminIp: '127.0.0.1',
        description: 'Test data seeded',
        metadata: {
          source: 'seed-script',
          timestamp: new Date().toISOString()
        }
      }
    });

    console.log('✅ Test data seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();