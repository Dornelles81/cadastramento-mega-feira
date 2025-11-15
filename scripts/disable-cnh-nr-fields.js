const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function disableCNHAndNRFields() {
  try {
    console.log('🔧 Desativando campos CNH e NR...\n')

    // Update CNH field to inactive
    const cnhResult = await prisma.customField.updateMany({
      where: {
        fieldName: 'cnh'
      },
      data: {
        active: false
      }
    })

    console.log(`✅ Campo CNH: ${cnhResult.count} campo(s) desativado(s)`)

    // Update NR field to inactive
    const nrResult = await prisma.customField.updateMany({
      where: {
        fieldName: 'nr'
      },
      data: {
        active: false
      }
    })

    console.log(`✅ Campo NR: ${nrResult.count} campo(s) desativado(s)`)

    // Get all active fields
    const activeFields = await prisma.customField.findMany({
      where: {
        active: true,
        fieldName: {
          notIn: ['_text_instructions', '_text_success']
        }
      },
      select: {
        fieldName: true,
        label: true,
        type: true,
        required: true
      },
      orderBy: {
        order: 'asc'
      }
    })

    console.log('\n📋 Campos ativos no formulário:')
    if (activeFields.length === 0) {
      console.log('   Nenhum campo personalizado ativo')
    } else {
      activeFields.forEach(field => {
        const requiredMark = field.required ? ' (obrigatório)' : ''
        console.log(`   - ${field.label} [${field.type}]${requiredMark}`)
      })
    }

    console.log('\n✨ Concluído! Os campos CNH e NR não aparecerão mais no formulário.\n')
  } catch (error) {
    console.error('❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

disableCNHAndNRFields()
