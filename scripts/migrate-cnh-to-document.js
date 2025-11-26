const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔄 Migrando campo CNH para DocumentConfig com OCR...\n')

  try {
    // Buscar evento Mega Feira 2025
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

    console.log(`📅 Evento: ${event.name} (${event.code})`)

    // 1. Desativar campo CNH personalizado
    const disabledFields = await prisma.customField.updateMany({
      where: {
        fieldName: 'CNH',
        eventId: event.id
      },
      data: {
        active: false
      }
    })
    console.log(`✅ Campo CNH personalizado desativado: ${disabledFields.count} registro(s)`)

    // 2. Criar DocumentConfig para CNH com OCR
    const existingDoc = await prisma.documentConfig.findFirst({
      where: {
        documentType: 'CNH',
        eventId: event.id
      }
    })

    if (existingDoc) {
      console.log('⚠️  DocumentConfig CNH já existe, atualizando...')
      await prisma.documentConfig.update({
        where: { id: existingDoc.id },
        data: {
          label: 'CNH - Carteira Nacional de Habilitação',
          description: 'Tire uma foto da frente da sua CNH ou faça upload',
          required: true,
          enableOCR: true, // ✅ OCR ATIVADO
          acceptedFormats: ['jpg', 'jpeg', 'png'],
          maxSizeMB: 5,
          order: 10,
          active: true,
          icon: '🚗',
          helpText: 'O sistema vai extrair automaticamente seus dados da CNH'
        }
      })
      console.log('✅ DocumentConfig CNH atualizado com OCR!')
    } else {
      await prisma.documentConfig.create({
        data: {
          eventId: event.id,
          documentType: 'CNH',
          label: 'CNH - Carteira Nacional de Habilitação',
          description: 'Tire uma foto da frente da sua CNH ou faça upload',
          required: true,
          enableOCR: true, // ✅ OCR ATIVADO
          acceptedFormats: ['jpg', 'jpeg', 'png'],
          maxSizeMB: 5,
          order: 10,
          active: true,
          icon: '🚗',
          helpText: 'O sistema vai extrair automaticamente seus dados da CNH'
        }
      })
      console.log('✅ DocumentConfig CNH criado com OCR!')
    }

    // 3. Verificar configurações finais
    const docs = await prisma.documentConfig.findMany({
      where: {
        eventId: event.id,
        active: true
      },
      orderBy: { order: 'asc' }
    })

    console.log('\n📋 Documentos configurados para o evento:')
    docs.forEach(doc => {
      console.log(`  ${doc.icon || '📄'} ${doc.label}`)
      console.log(`    - Tipo: ${doc.documentType}`)
      console.log(`    - OCR: ${doc.enableOCR ? '✅ Ativado' : '❌ Desativado'}`)
      console.log(`    - Obrigatório: ${doc.required ? 'Sim' : 'Não'}`)
    })

    console.log('\n✅ Migração concluída!')
    console.log('\n📱 Agora a CNH terá:')
    console.log('  ✅ Captura via câmera ou upload')
    console.log('  ✅ OCR automático para extrair dados')
    console.log('  ✅ Preenchimento automático do formulário')
    console.log('  ✅ Validação visual da qualidade da imagem\n')

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
