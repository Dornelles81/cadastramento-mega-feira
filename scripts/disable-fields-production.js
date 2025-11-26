const { PrismaClient } = require('@prisma/client')

// Use production database URL
const DATABASE_URL = process.env.DATABASE_URL_PRODUCTION || process.env.DATABASE_URL

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
})

async function disableFieldsInProduction() {
  try {
    console.log('🔧 Conectando ao banco de dados de produção...\n')

    // Disable CNH field
    const cnhResult = await prisma.customField.updateMany({
      where: {
        fieldName: 'cnh'
      },
      data: {
        active: false
      }
    })

    console.log(`✅ Campo CNH: ${cnhResult.count} campo(s) desativado(s)`)

    // Disable NR field
    const nrResult = await prisma.customField.updateMany({
      where: {
        fieldName: 'nr'
      },
      data: {
        active: false
      }
    })

    console.log(`✅ Campo NR: ${nrResult.count} campo(s) desativado(s)`)

    // Remove document configs if they exist
    const docResult = await prisma.documentConfig.deleteMany({
      where: {
        documentType: {
          in: ['cnh', 'nr']
        }
      }
    })

    console.log(`✅ Documentos CNH/NR: ${docResult.count} documento(s) removido(s)`)

    // Get active fields
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

    console.log('\n📋 Campos ativos no formulário de produção:')
    if (activeFields.length === 0) {
      console.log('   Nenhum campo personalizado ativo')
    } else {
      activeFields.forEach(field => {
        const requiredMark = field.required ? ' (obrigatório)' : ''
        console.log(`   - ${field.label} [${field.type}]${requiredMark}`)
      })
    }

    console.log('\n✨ Processo concluído! Os campos CNH e NR foram removidos da produção.\n')

  } catch (error) {
    console.error('❌ Erro:', error)
    console.error('\n💡 Verifique se a variável DATABASE_URL aponta para o banco de produção.')
  } finally {
    await prisma.$disconnect()
  }
}

disableFieldsInProduction()
