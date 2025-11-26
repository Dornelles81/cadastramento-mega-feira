const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function removeDocuments() {
  try {
    console.log('🗑️  Removendo documentos CNH e NR...')

    // Delete CNH document
    const deletedCNH = await prisma.documentConfig.deleteMany({
      where: {
        documentType: {
          in: ['cnh', 'nr']
        }
      }
    })

    console.log(`✅ ${deletedCNH.count} documento(s) removido(s)`)

    // List remaining documents
    const remaining = await prisma.documentConfig.findMany({
      select: {
        documentType: true,
        label: true,
        active: true,
        required: true
      },
      orderBy: { order: 'asc' }
    })

    console.log('\n📋 Documentos restantes:')
    remaining.forEach(doc => {
      console.log(`  - ${doc.label} (${doc.documentType}): ${doc.active ? '✅ Ativo' : '❌ Inativo'}, ${doc.required ? '⚠️ Obrigatório' : '○ Opcional'}`)
    })

  } catch (error) {
    console.error('❌ Erro ao remover documentos:', error)
  } finally {
    await prisma.$disconnect()
  }
}

removeDocuments()
