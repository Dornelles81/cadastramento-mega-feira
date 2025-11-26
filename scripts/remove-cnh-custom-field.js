const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🗑️  Removendo CustomField CNH conflitante...\n')

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

    // Buscar CustomField CNH
    const cnhCustomFields = await prisma.customField.findMany({
      where: {
        fieldName: 'CNH',
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      }
    })

    if (cnhCustomFields.length === 0) {
      console.log('✅ Nenhum CustomField "CNH" encontrado. Tudo certo!\n')
      return
    }

    console.log(`📋 Encontrado ${cnhCustomFields.length} CustomField(s) "CNH":\n`)
    cnhCustomFields.forEach(field => {
      const scope = field.eventId ? `Evento: ${field.eventId}` : 'GLOBAL'
      console.log(`  - ID: ${field.id}`)
      console.log(`    Label: ${field.label}`)
      console.log(`    Scope: ${scope}`)
      console.log(`    Active: ${field.active}\n`)
    })

    // Deletar todos os CustomFields CNH
    const result = await prisma.customField.deleteMany({
      where: {
        fieldName: 'CNH',
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      }
    })

    console.log(`✅ ${result.count} CustomField(s) "CNH" removido(s) com sucesso!\n`)

    // Verificar DocumentConfig CNH
    const cnhDocConfig = await prisma.documentConfig.findFirst({
      where: {
        documentType: 'CNH',
        eventId: event.id,
        active: true
      }
    })

    if (cnhDocConfig) {
      console.log('✅ DocumentConfig CNH está ATIVO')
      console.log('   - COM botões de Câmera e Arquivo')
      console.log('   - COM OCR automático')
      console.log('   - Campo obrigatório\n')
      console.log('🎉 Agora o formulário deve mostrar CNH com interface completa!')
      console.log('   Recarregue a página: http://localhost:3000/?event=mega-feira-2025\n')
    } else {
      console.log('⚠️  DocumentConfig CNH não está ativo!')
      console.log('   Execute: node scripts/enable-cnh-document.js\n')
    }

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
