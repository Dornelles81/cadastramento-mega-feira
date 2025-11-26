const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔧 Adicionando permissões de acesso aos eventos...\n')

  try {
    // Find Mega Feira event
    const megaFeira = await prisma.event.findFirst({
      where: { code: { equals: 'MEGA-FEIRA-2025', mode: 'insensitive' } }
    })

    if (!megaFeira) {
      console.log('❌ Evento MEGA-FEIRA-2025 não encontrado')
      console.log('   Execute: node scripts/create-event.js\n')
      return
    }

    console.log(`✅ Evento encontrado: ${megaFeira.name} (${megaFeira.code})\n`)

    // Find admin
    const admin = await prisma.eventAdmin.findUnique({
      where: { email: 'evento@megafeira.com.br' }
    })

    if (!admin) {
      console.log('❌ Admin evento@megafeira.com.br não encontrado')
      console.log('   Execute: node scripts/create-demo-admins.js\n')
      return
    }

    console.log(`✅ Admin encontrado: ${admin.name} (${admin.email})\n`)

    // Check if access already exists
    const existingAccess = await prisma.eventAdminAccess.findFirst({
      where: {
        adminId: admin.id,
        eventId: megaFeira.id
      }
    })

    if (existingAccess) {
      console.log('⏭️  Permissões já existem!')
      console.log(`   Admin: ${admin.name}`)
      console.log(`   Evento: ${megaFeira.name}`)
      console.log(`   Permissões:`)
      console.log(`     - Ver: ${existingAccess.canView ? '✅' : '❌'}`)
      console.log(`     - Editar: ${existingAccess.canEdit ? '✅' : '❌'}`)
      console.log(`     - Aprovar: ${existingAccess.canApprove ? '✅' : '❌'}`)
      console.log(`     - Deletar: ${existingAccess.canDelete ? '✅' : '❌'}`)
      console.log(`     - Exportar: ${existingAccess.canExport ? '✅' : '❌'}`)
      console.log(`     - Gerenciar Estandes: ${existingAccess.canManageStands ? '✅' : '❌'}\n`)

      // Update to ensure all permissions are true
      await prisma.eventAdminAccess.update({
        where: { id: existingAccess.id },
        data: {
          canView: true,
          canEdit: true,
          canApprove: true,
          canDelete: true,
          canExport: true,
          canManageStands: true,
          isActive: true
        }
      })

      console.log('✅ Permissões atualizadas com sucesso!\n')
    } else {
      // Create new access
      await prisma.eventAdminAccess.create({
        data: {
          adminId: admin.id,
          eventId: megaFeira.id,
          canView: true,
          canEdit: true,
          canApprove: true,
          canDelete: true,
          canExport: true,
          canManageStands: true,
          canManageAdmins: false,
          isActive: true
        }
      })

      console.log('✅ Permissões criadas com sucesso!')
      console.log(`   Admin: ${admin.name}`)
      console.log(`   Evento: ${megaFeira.name}`)
      console.log(`   Permissões: TODAS ✅\n`)
    }

    // Verify all admins and their access
    console.log('═══════════════════════════════════════════════════════')
    console.log('📋 RESUMO DE ACESSO')
    console.log('═══════════════════════════════════════════════════════\n')

    const allAdmins = await prisma.eventAdmin.findMany({
      include: {
        events: {
          include: {
            event: true
          }
        }
      }
    })

    for (const adm of allAdmins) {
      console.log(`👤 ${adm.name} (${adm.email})`)
      console.log(`   Role: ${adm.role}`)
      console.log(`   Ativo: ${adm.isActive ? '✅' : '❌'}`)

      if (adm.role === 'SUPER_ADMIN') {
        console.log(`   Acesso: TODOS OS EVENTOS (Super Admin)\n`)
      } else if (adm.events.length === 0) {
        console.log(`   ⚠️  NENHUM EVENTO ATRIBUÍDO\n`)
      } else {
        console.log(`   Eventos (${adm.events.length}):`)
        for (const access of adm.events) {
          console.log(`     - ${access.event.name}`)
          console.log(`       Ver: ${access.canView ? '✅' : '❌'} | Editar: ${access.canEdit ? '✅' : '❌'} | Aprovar: ${access.canApprove ? '✅' : '❌'}`)
        }
        console.log('')
      }
    }

    console.log('═══════════════════════════════════════════════════════')
    console.log('🔗 PRÓXIMOS PASSOS')
    console.log('═══════════════════════════════════════════════════════\n')

    console.log('1. Acesse: http://localhost:3000/admin/login')
    console.log('2. Faça login com:')
    console.log('   Email: evento@megafeira.com.br')
    console.log('   Senha: EventAdmin@2025')
    console.log('3. Você verá o dashboard com a Mega Feira')
    console.log('4. Clique no card da Mega Feira para ver participantes\n')

    console.log('✅ Configuração completa!\n')

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
