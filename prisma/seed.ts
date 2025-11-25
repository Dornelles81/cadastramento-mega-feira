import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // ============================================================================
  // 1. CREATE DEFAULT EVENT
  // ============================================================================
  console.log('📅 Creating default event: Mega Feira 2025...')

  const defaultEvent = await prisma.event.upsert({
    where: { slug: 'mega-feira-2025' },
    update: {},
    create: {
      slug: 'mega-feira-2025',
      name: 'Mega Feira 2025',
      code: 'MEGA-FEIRA-2025',
      description: 'Evento principal de cadastramento com reconhecimento facial',

      // Schedule
      startDate: new Date('2025-08-01'),
      endDate: new Date('2025-08-31'),
      timezone: 'America/Sao_Paulo',

      // Capacity
      maxCapacity: 2000,
      currentCount: 0,

      // Status
      status: 'active',
      isActive: true,
      isPublic: true,

      // Customization
      theme: {
        primaryColor: '#8B5CF6',
        secondaryColor: '#EC4899',
        accentColor: '#F59E0B'
      },
      settings: {
        requireDocuments: false,
        autoApprove: false,
        notifyParticipants: true
      },
      features: {
        facialRecognition: true,
        documentUpload: true,
        hikCentralSync: true
      },

      // Contact
      organizerName: 'Equipe Mega Feira',
      organizerEmail: 'contato@megafeira.com.br',
      organizerPhone: '(51) 99999-9999',

      // Location
      venueName: 'Parque de Exposições Assis Brasil',
      venueAddress: 'Av. Assis Brasil, 10000',
      venueCity: 'Esteio',
      venueState: 'RS',

      // Metadata
      tags: ['feira', 'agropecuária', '2025'],

      // Publication
      publishedAt: new Date()
    }
  })

  console.log(`✅ Event created: ${defaultEvent.name} (${defaultEvent.slug})`)

  // ============================================================================
  // 2. CREATE EVENT CONFIGURATION
  // ============================================================================
  console.log('⚙️ Creating event configuration...')

  await prisma.eventConfig.upsert({
    where: { eventId: defaultEvent.id },
    update: {},
    create: {
      eventId: defaultEvent.id,

      // Branding
      logoUrl: '/mega-feira-logo.svg',
      primaryColor: '#8B5CF6',
      secondaryColor: '#EC4899',
      accentColor: '#F59E0B',

      // Registration settings
      requireConsent: true,
      requireFace: true,
      requireDocuments: false,
      autoApprove: false,

      // Messages
      welcomeMessage: 'Bem-vindo ao cadastramento da Mega Feira 2025!',
      successMessage: 'Cadastro realizado com sucesso! Aguardamos você no evento.',
      consentText: 'Autorizo o uso da minha imagem facial para controle de acesso ao evento.',

      // Features
      enableCheckIn: true,
      enableQRCode: true,
      enableExport: true,

      // Notifications
      notifyOnRegister: true,
      notifyOnApprove: false,
      adminEmail: 'admin@megafeira.com.br'
    }
  })

  console.log('✅ Event configuration created')

  // ============================================================================
  // 3. CREATE SUPER ADMIN
  // ============================================================================
  console.log('👑 Creating SUPER ADMIN user...')

  const hashedPassword = await bcrypt.hash('SuperAdmin@2025', 10)

  const superAdmin = await prisma.eventAdmin.upsert({
    where: { email: 'admin@megafeira.com.br' },
    update: {},
    create: {
      name: 'Super Administrador',
      email: 'admin@megafeira.com.br',
      password: hashedPassword,
      phone: '(51) 99999-9999',
      role: 'SUPER_ADMIN',
      isActive: true,
      emailVerified: true,
      preferences: {
        theme: 'light',
        notifications: true
      }
    }
  })

  console.log(`✅ Super Admin created: ${superAdmin.email}`)
  console.log(`   Password: SuperAdmin@2025`)

  // ============================================================================
  // 4. CREATE EVENT ADMIN (Example)
  // ============================================================================
  console.log('👤 Creating EVENT ADMIN user...')

  const eventAdminPassword = await bcrypt.hash('EventAdmin@2025', 10)

  const eventAdmin = await prisma.eventAdmin.upsert({
    where: { email: 'evento@megafeira.com.br' },
    update: {},
    create: {
      name: 'Administrador do Evento',
      email: 'evento@megafeira.com.br',
      password: eventAdminPassword,
      phone: '(51) 98888-8888',
      role: 'EVENT_ADMIN',
      isActive: true,
      emailVerified: true,
      preferences: {
        theme: 'light',
        notifications: true
      }
    }
  })

  console.log(`✅ Event Admin created: ${eventAdmin.email}`)
  console.log(`   Password: EventAdmin@2025`)

  // ============================================================================
  // 5. GRANT EVENT ADMIN ACCESS TO DEFAULT EVENT
  // ============================================================================
  console.log('🔐 Granting event admin access...')

  await prisma.eventAdminAccess.upsert({
    where: {
      adminId_eventId: {
        adminId: eventAdmin.id,
        eventId: defaultEvent.id
      }
    },
    update: {},
    create: {
      adminId: eventAdmin.id,
      eventId: defaultEvent.id,
      canView: true,
      canEdit: true,
      canApprove: true,
      canDelete: false,
      canExport: true,
      canManageStands: true,
      canManageAdmins: false,
      isActive: true,
      grantedBy: superAdmin.id
    }
  })

  console.log('✅ Event admin access granted')

  // ============================================================================
  // 6. MIGRATE EXISTING PARTICIPANTS TO DEFAULT EVENT
  // ============================================================================
  console.log('🔄 Migrating existing participants to default event...')

  const migratedCount = await prisma.participant.updateMany({
    where: {
      eventId: null
    },
    data: {
      eventId: defaultEvent.id
    }
  })

  console.log(`✅ Migrated ${migratedCount.count} participants to ${defaultEvent.name}`)

  // ============================================================================
  // 7. MIGRATE EXISTING STANDS TO DEFAULT EVENT
  // ============================================================================
  console.log('🏪 Migrating existing stands to default event...')

  const migratedStands = await prisma.stand.updateMany({
    where: {
      eventId: null
    },
    data: {
      eventId: defaultEvent.id
    }
  })

  console.log(`✅ Migrated ${migratedStands.count} stands to ${defaultEvent.name}`)

  // ============================================================================
  // 8. CREATE AUDIT LOG
  // ============================================================================
  console.log('📝 Creating seed audit log...')

  await prisma.auditLog.create({
    data: {
      eventId: defaultEvent.id,
      adminId: superAdmin.id,
      action: 'SEED',
      entityType: 'system',
      description: 'Database seeded with initial data',
      severity: 'INFO',
      metadata: {
        eventCreated: true,
        superAdminCreated: true,
        eventAdminCreated: true,
        participantsMigrated: migratedCount.count,
        standsMigrated: migratedStands.count
      }
    }
  })

  console.log('✅ Audit log created')

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n🎉 Database seed completed successfully!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 SUMMARY:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Event: ${defaultEvent.name} (${defaultEvent.slug})`)
  console.log(`✅ Super Admin: ${superAdmin.email}`)
  console.log(`   🔑 Password: SuperAdmin@2025`)
  console.log(`✅ Event Admin: ${eventAdmin.email}`)
  console.log(`   🔑 Password: EventAdmin@2025`)
  console.log(`✅ Participants migrated: ${migratedCount.count}`)
  console.log(`✅ Stands migrated: ${migratedStands.count}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n🚀 Next steps:')
  console.log('1. Run: npm run dev')
  console.log('2. Access: http://localhost:3000/admin/login')
  console.log('3. Login with super admin credentials')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
