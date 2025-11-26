const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔄 Desativando DocumentConfigs do evento MEGA-FEIRA-2025...\n')

  try {
    // Buscar evento
    const event = await prisma.event.findFirst({
      where: {
        code: {
          equals: 'MEGA-FEIRA-2025',
          mode: 'insensitive'
        }
      }
    })

    if (!event) {
      console.log('❌ Evento não encontrado!')
      return
    }

    console.log(`📅 Evento: ${event.name} (${event.code})\n`)

    // Desativar DocumentConfigs do evento
    const eventDocs = await prisma.documentConfig.updateMany({
      where: {
        eventId: event.id,
        active: true
      },
      data: {
        active: false
      }
    })

    console.log(`✅ DocumentConfigs do evento desativados: ${eventDocs.count}`)

    // Desativar DocumentConfigs GLOBAIS (opcional - pergunte ao usuário)
    console.log('\n⚠️  ATENÇÃO: Também existem DocumentConfigs GLOBAIS ativos:')

    const globalDocs = await prisma.documentConfig.findMany({
      where: {
        eventId: null,
        active: true
      }
    })

    globalDocs.forEach(doc => {
      console.log(`  - ${doc.label} (${doc.documentType})`)
    })

    console.log('\n💡 Para desativar os campos GLOBAIS também, rode:')
    console.log('   node scripts/disable-all-document-fields.js\n')

    // Verificar resultado
    const activeDocs = await prisma.documentConfig.findMany({
      where: {
        OR: [
          { eventId: event.id },
          { eventId: null }
        ],
        active: true
      }
    })

    console.log('\n📋 DocumentConfigs ainda ativos:')
    if (activeDocs.length === 0) {
      console.log('   Nenhum (todos desativados para este evento)')
    } else {
      activeDocs.forEach(doc => {
        const scope = doc.eventId ? 'EVENT' : 'GLOBAL'
        console.log(`   - ${doc.label} (${scope})`)
      })
    }

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
