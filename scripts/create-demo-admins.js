const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('\n🔧 Criando usuários admin de demonstração...\n')

  try {
    // Find eventos
    const megaFeira = await prisma.event.findFirst({
      where: { code: { equals: 'MEGA-FEIRA-2025', mode: 'insensitive' } }
    })

    const expofest = await prisma.event.findFirst({
      where: { code: { equals: 'EXPOFEST-2026', mode: 'insensitive' } }
    })

    if (!megaFeira) {
      console.log('⚠️  Evento MEGA-FEIRA-2025 não encontrado')
    }

    if (!expofest) {
      console.log('⚠️  Evento EXPOFEST-2026 não encontrado')
    }

    // ========================================================================
    // 1. SUPER ADMIN
    // ========================================================================
    const superAdminEmail = 'admin@megafeira.com.br'
    const superAdminPassword = 'SuperAdmin@2025'

    let superAdmin = await prisma.eventAdmin.findUnique({
      where: { email: superAdminEmail }
    })

    if (!superAdmin) {
      const hashedPassword = await bcrypt.hash(superAdminPassword, 10)

      superAdmin = await prisma.eventAdmin.create({
        data: {
          email: superAdminEmail,
          password: hashedPassword,
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          isActive: true,
          loginAttempts: 0
        }
      })

      console.log('✅ Super Admin criado:')
      console.log(`   Email: ${superAdminEmail}`)
      console.log(`   Senha: ${superAdminPassword}`)
      console.log(`   Role: SUPER_ADMIN`)
      console.log(`   Acesso: TODOS os eventos\n`)
    } else {
      console.log('⏭️  Super Admin já existe:', superAdminEmail, '\n')
    }

    // ========================================================================
    // 2. EVENT ADMIN (Mega Feira)
    // ========================================================================
    if (megaFeira) {
      const eventAdminEmail = 'evento@megafeira.com.br'
      const eventAdminPassword = 'EventAdmin@2025'

      let eventAdmin = await prisma.eventAdmin.findUnique({
        where: { email: eventAdminEmail }
      })

      if (!eventAdmin) {
        const hashedPassword = await bcrypt.hash(eventAdminPassword, 10)

        eventAdmin = await prisma.eventAdmin.create({
          data: {
            email: eventAdminEmail,
            password: hashedPassword,
            name: 'Admin Mega Feira',
            role: 'ADMIN',
            isActive: true,
            loginAttempts: 0
          }
        })

        console.log('✅ Event Admin (Mega Feira) criado:')
        console.log(`   Email: ${eventAdminEmail}`)
        console.log(`   Senha: ${eventAdminPassword}`)
        console.log(`   Role: ADMIN\n`)
      } else {
        console.log('⏭️  Event Admin já existe:', eventAdminEmail, '\n')
      }

      // Check if event access exists
      const existingAccess = await prisma.adminEvent.findFirst({
        where: {
          adminId: eventAdmin.id,
          eventId: megaFeira.id
        }
      })

      if (!existingAccess) {
        await prisma.adminEvent.create({
          data: {
            adminId: eventAdmin.id,
            eventId: megaFeira.id,
            canView: true,
            canEdit: true,
            canApprove: true,
            canDelete: true,
            canExport: true,
            canManageStands: true,
            canManageAdmins: false
          }
        })

        console.log(`✅ Permissões atribuídas para ${eventAdmin.name} no evento ${megaFeira.name}`)
        console.log('   - Ver participantes ✅')
        console.log('   - Editar ✅')
        console.log('   - Aprovar/Rejeitar ✅')
        console.log('   - Deletar ✅')
        console.log('   - Exportar ✅')
        console.log('   - Gerenciar Estandes ✅\n')
      } else {
        console.log(`⏭️  Permissões já existem para ${megaFeira.name}\n`)
      }
    }

    // ========================================================================
    // 3. EVENT ADMIN (Expofest) - Optional
    // ========================================================================
    if (expofest) {
      const expofestAdminEmail = 'expofest@megafeira.com.br'
      const expofestAdminPassword = 'Expofest@2026'

      let expofestAdmin = await prisma.eventAdmin.findUnique({
        where: { email: expofestAdminEmail }
      })

      if (!expofestAdmin) {
        const hashedPassword = await bcrypt.hash(expofestAdminPassword, 10)

        expofestAdmin = await prisma.eventAdmin.create({
          data: {
            email: expofestAdminEmail,
            password: hashedPassword,
            name: 'Admin Expofest',
            role: 'ADMIN',
            isActive: true,
            loginAttempts: 0
          }
        })

        console.log('✅ Event Admin (Expofest) criado:')
        console.log(`   Email: ${expofestAdminEmail}`)
        console.log(`   Senha: ${expofestAdminPassword}`)
        console.log(`   Role: ADMIN\n`)
      } else {
        console.log('⏭️  Expofest Admin já existe:', expofestAdminEmail, '\n')
      }

      // Check if event access exists
      const existingAccess = await prisma.adminEvent.findFirst({
        where: {
          adminId: expofestAdmin.id,
          eventId: expofest.id
        }
      })

      if (!existingAccess) {
        await prisma.adminEvent.create({
          data: {
            adminId: expofestAdmin.id,
            eventId: expofest.id,
            canView: true,
            canEdit: true,
            canApprove: true,
            canDelete: true,
            canExport: true,
            canManageStands: true,
            canManageAdmins: false
          }
        })

        console.log(`✅ Permissões atribuídas para ${expofestAdmin.name} no evento ${expofest.name}`)
        console.log('   - Ver participantes ✅')
        console.log('   - Editar ✅')
        console.log('   - Aprovar/Rejeitar ✅')
        console.log('   - Deletar ✅')
        console.log('   - Exportar ✅')
        console.log('   - Gerenciar Estandes ✅\n')
      } else {
        console.log(`⏭️  Permissões já existem para ${expofest.name}\n`)
      }
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('═══════════════════════════════════════════════════════')
    console.log('📋 CREDENCIAIS DE ACESSO')
    console.log('═══════════════════════════════════════════════════════\n')

    console.log('🔓 SUPER ADMIN (acesso total):')
    console.log(`   URL: http://localhost:3000/admin/login`)
    console.log(`   Email: admin@megafeira.com.br`)
    console.log(`   Senha: SuperAdmin@2025\n`)

    if (megaFeira) {
      console.log('👤 ADMIN MEGA FEIRA:')
      console.log(`   URL: http://localhost:3000/admin/login`)
      console.log(`   Email: evento@megafeira.com.br`)
      console.log(`   Senha: EventAdmin@2025\n`)
    }

    if (expofest) {
      console.log('👤 ADMIN EXPOFEST:')
      console.log(`   URL: http://localhost:3000/admin/login`)
      console.log(`   Email: expofest@megafeira.com.br`)
      console.log(`   Senha: Expofest@2026\n`)
    }

    console.log('✅ Configuração concluída!\n')

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
