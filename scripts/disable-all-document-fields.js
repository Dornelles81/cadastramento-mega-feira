const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n⚠️  DESATIVANDO TODOS OS DOCUMENTCONFIGS (GLOBAIS E DO EVENTO)...\n')

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

    // Desativar TODOS os DocumentConfigs (globais + do evento)
    const allDocs = await prisma.documentConfig.updateMany({
      where: {
        OR: [
          { eventId: event.id },
          { eventId: null }
        ],
        active: true
      },
      data: {
        active: false
      }
    })

    console.log(`✅ Total de DocumentConfigs desativados: ${allDocs.count}\n`)

    // Verificar
    const remaining = await prisma.documentConfig.findMany({
      where: {
        OR: [
          { eventId: event.id },
          { eventId: null }
        ],
        active: true
      }
    })

    if (remaining.length === 0) {
      console.log('✅ Sucesso! Nenhum DocumentConfig ativo.')
      console.log('   O formulário agora não solicitará documentos.\n')
    } else {
      console.log('⚠️  Ainda há DocumentConfigs ativos:')
      remaining.forEach(doc => console.log(`  - ${doc.label}`))
    }

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
