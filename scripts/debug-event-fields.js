const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n=== DEBUG: Campos do Evento MEGA-FEIRA-2025 ===\n')

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
      console.log('Evento não encontrado!')
      return
    }

    console.log(`Evento: ${event.name} (ID: ${event.id})\n`)

    // CustomFields - TODOS (incluindo inativos)
    const customFields = await prisma.customField.findMany({
      where: {
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      },
      orderBy: { fieldName: 'asc' }
    })

    console.log('--- CUSTOM FIELDS (TODOS) ---')
    customFields.forEach(f => {
      console.log(`${f.active ? '✅' : '❌'} ${f.label} (${f.fieldName})`)
      console.log(`   Tipo: ${f.type}`)
      console.log(`   EventId: ${f.eventId || 'GLOBAL'}`)
      console.log(`   Obrigatório: ${f.required ? 'Sim' : 'Não'}`)
      console.log(`   Ordem: ${f.order}`)
      console.log(`   ID: ${f.id}`)
      console.log('')
    })

    // DocumentConfigs - TODOS
    const docConfigs = await prisma.documentConfig.findMany({
      where: {
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      },
      orderBy: { documentType: 'asc' }
    })

    console.log('--- DOCUMENT CONFIGS (TODOS) ---')
    docConfigs.forEach(d => {
      console.log(`${d.active ? '✅' : '❌'} ${d.label} (${d.documentType})`)
      console.log(`   OCR: ${d.enableOCR ? 'SIM' : 'NÃO'}`)
      console.log(`   EventId: ${d.eventId || 'GLOBAL'}`)
      console.log(`   Obrigatório: ${d.required ? 'Sim' : 'Não'}`)
      console.log(`   Ordem: ${d.order}`)
      console.log(`   ID: ${d.id}`)
      console.log('')
    })

  } catch (error) {
    console.error('Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
