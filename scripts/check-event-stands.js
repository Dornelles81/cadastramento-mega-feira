const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔍 Verificando stands do evento Mega Feira 2025...\n')

  try {
    // Buscar evento
    const event = await prisma.event.findFirst({
      where: {
        code: {
          equals: 'MEGA-FEIRA-2025',
          mode: 'insensitive'
        }
      },
      include: {
        stands: true
      }
    })

    if (!event) {
      console.log('❌ Evento não encontrado!')
      return
    }

    console.log(`📅 Evento: ${event.name} (${event.code})`)
    console.log(`🆔 ID: ${event.id}`)
    console.log(`\n🏪 Estandes cadastrados: ${event.stands.length}`)

    if (event.stands.length === 0) {
      console.log('\n⚠️  NENHUM ESTANDE CADASTRADO PARA ESTE EVENTO!')
      console.log('💡 Para cadastrar estandes, acesse: /admin/stands')
    } else {
      console.log('\nEstandes:')
      event.stands.forEach(stand => {
        console.log(`  - ${stand.name} (${stand.code})`)
        console.log(`    Local: ${stand.location || 'N/A'}`)
        console.log(`    Vagas: ${stand.availableSlots}/${stand.maxRegistrations}`)
      })
    }
  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
