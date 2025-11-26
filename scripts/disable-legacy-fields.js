const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔧 Desativando campos legados globais...\n')

  try {
    // Desativar campo "etapa" (Operação)
    const etapaField = await prisma.customField.updateMany({
      where: {
        fieldName: 'etapa',
        eventId: null
      },
      data: {
        active: false
      }
    })
    console.log(`✅ Campo "etapa" (Operação) desativado: ${etapaField.count} registro(s)`)

    // Desativar campo "estande" global (o estande é gerenciado por /admin/stands)
    const estandeField = await prisma.customField.updateMany({
      where: {
        fieldName: 'estande',
        eventId: null
      },
      data: {
        active: false
      }
    })
    console.log(`✅ Campo "estande" global desativado: ${estandeField.count} registro(s)`)

    // Verificar campos ativos restantes
    const activeFields = await prisma.customField.findMany({
      where: {
        active: true,
        NOT: {
          fieldName: {
            startsWith: '_system_'
          }
        }
      },
      select: {
        fieldName: true,
        label: true,
        eventId: true,
        event: {
          select: {
            name: true,
            code: true
          }
        }
      }
    })

    console.log('\n📋 Campos personalizados ativos restantes:')
    activeFields.forEach(field => {
      if (field.eventId) {
        console.log(`  ✓ ${field.label} (${field.fieldName}) - Evento: ${field.event.name}`)
      } else {
        console.log(`  ✓ ${field.label} (${field.fieldName}) - Global`)
      }
    })

    console.log('\n✅ Campos legados desativados com sucesso!\n')
  } catch (error) {
    console.error('\n❌ Erro ao desativar campos:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
