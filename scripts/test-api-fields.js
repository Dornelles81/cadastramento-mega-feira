const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔍 Testando API de Campos para MEGA-FEIRA-2025\n')

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

    console.log(`📅 Evento: ${event.name} (ID: ${event.id})\n`)

    // Simular o que a API /api/form-fields faz
    const customFields = await prisma.customField.findMany({
      where: {
        active: true,  // Apenas ativos
        OR: [
          { eventId: event.id },  // Event-specific
          { eventId: null }       // Global
        ],
        NOT: {
          fieldName: {
            startsWith: '_system_'
          }
        }
      },
      orderBy: { order: 'asc' }
    })

    console.log('=== CAMPOS RETORNADOS PELA API (CustomFields) ===')
    console.log(`Total: ${customFields.length} campos ativos\n`)

    customFields.forEach(f => {
      const scope = f.eventId ? 'EVENT' : 'GLOBAL'
      console.log(`${f.active ? '✅' : '❌'} ${f.label} (${f.fieldName})`)
      console.log(`   Tipo: ${f.type}`)
      console.log(`   Escopo: ${scope}`)
      console.log(`   Ordem: ${f.order}`)
      console.log('')
    })

    // Campos de sistema
    const systemFieldConfigs = await prisma.customField.findMany({
      where: {
        fieldName: {
          startsWith: '_system_'
        }
      }
    })

    console.log('\n=== CAMPOS DE SISTEMA ===')
    systemFieldConfigs.forEach(f => {
      console.log(`${f.active ? '✅' : '❌'} ${f.fieldName}`)
      console.log(`   Required: ${f.required}`)
      console.log(`   Active: ${f.active}`)
    })

  } catch (error) {
    console.error('Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
