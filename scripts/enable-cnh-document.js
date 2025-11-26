const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔄 Ativando CNH como DocumentConfig (com OCR)...\n')

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

    // Ativar CNH DocumentConfig para o evento
    const result = await prisma.documentConfig.updateMany({
      where: {
        documentType: 'CNH',
        eventId: event.id
      },
      data: {
        active: true,
        required: true,
        enableOCR: true
      }
    })

    if (result.count > 0) {
      console.log('✅ CNH DocumentConfig ativado com sucesso!')
      console.log('   - COM botões de Câmera e Arquivo')
      console.log('   - COM OCR automático')
      console.log('   - Campo obrigatório\n')
    } else {
      console.log('⚠️  CNH DocumentConfig não encontrado para este evento.')
      console.log('   Criando novo DocumentConfig...\n')

      await prisma.documentConfig.create({
        data: {
          eventId: event.id,
          documentType: 'CNH',
          label: 'CNH - Carteira Nacional de Habilitação',
          description: 'Tire uma foto da frente da sua CNH ou faça upload',
          required: true,
          enableOCR: true,
          acceptedFormats: ['jpg', 'jpeg', 'png'],
          maxSizeMB: 5,
          order: 10,
          active: true,
          icon: '🚗',
          helpText: 'O sistema vai extrair automaticamente seus dados da CNH'
        }
      })

      console.log('✅ CNH DocumentConfig criado com sucesso!')
    }

    // Verificar CustomFields conflitantes
    const cnhCustomField = await prisma.customField.findFirst({
      where: {
        fieldName: 'CNH',
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      }
    })

    if (cnhCustomField) {
      console.log('\n⚠️  ATENÇÃO: Encontrado CustomField "CNH" conflitante!')
      console.log('   Esse campo vai aparecer como upload simples (sem câmera)')
      console.log('   Recomendação: EXCLUIR esse campo em /admin/eventos/.../campos\n')
    }

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
