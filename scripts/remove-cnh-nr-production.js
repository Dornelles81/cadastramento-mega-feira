const { PrismaClient } = require('@prisma/client')

// Connect to production database (NEON)
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function removeDocumentsFromProduction() {
  try {
    console.log('🌐 Conectando ao banco de dados de PRODUÇÃO (NEON)...')
    console.log('📍 Database:', process.env.DATABASE_URL?.substring(0, 50) + '...')

    // First, list all documents
    console.log('\n📋 Documentos ANTES da remoção:')
    const beforeDocs = await prisma.documentConfig.findMany({
      select: {
        documentType: true,
        label: true,
        active: true,
        required: true
      },
      orderBy: { order: 'asc' }
    })

    beforeDocs.forEach(doc => {
      console.log(`  - ${doc.label} (${doc.documentType}): ${doc.active ? '✅ Ativo' : '❌ Inativo'}, ${doc.required ? '⚠️ Obrigatório' : '○ Opcional'}`)
    })

    // Delete CNH and NR documents
    console.log('\n🗑️  Removendo documentos CNH e NR...')
    const deletedCount = await prisma.documentConfig.deleteMany({
      where: {
        documentType: {
          in: ['cnh', 'nr']
        }
      }
    })

    console.log(`✅ ${deletedCount.count} documento(s) removido(s) com sucesso!`)

    // List remaining documents
    console.log('\n📋 Documentos APÓS a remoção:')
    const afterDocs = await prisma.documentConfig.findMany({
      select: {
        documentType: true,
        label: true,
        active: true,
        required: true
      },
      orderBy: { order: 'asc' }
    })

    if (afterDocs.length === 0) {
      console.log('  ⚠️  Nenhum documento restante!')
    } else {
      afterDocs.forEach(doc => {
        console.log(`  - ${doc.label} (${doc.documentType}): ${doc.active ? '✅ Ativo' : '❌ Inativo'}, ${doc.required ? '⚠️ Obrigatório' : '○ Opcional'}`)
      })
    }

    console.log('\n✨ Operação concluída com sucesso!')

  } catch (error) {
    console.error('\n❌ Erro ao remover documentos:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

removeDocumentsFromProduction()
