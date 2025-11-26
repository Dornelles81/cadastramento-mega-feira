const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🔍 Verificando configuração final do campo CNH...\n')

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

    // Verificar CustomFields CNH (não deve existir)
    const cnhCustomFields = await prisma.customField.findMany({
      where: {
        fieldName: 'CNH',
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      }
    })

    console.log('═══════════════════════════════════════════════════════')
    console.log('📋 CUSTOM FIELDS (campos simples)')
    console.log('═══════════════════════════════════════════════════════\n')

    if (cnhCustomFields.length === 0) {
      console.log('✅ Nenhum CustomField "CNH" encontrado (correto!)\n')
    } else {
      console.log(`⚠️  PROBLEMA: Ainda existem ${cnhCustomFields.length} CustomField(s) "CNH":\n`)
      cnhCustomFields.forEach(field => {
        console.log(`  - ${field.label} (${field.eventId ? 'EVENT' : 'GLOBAL'}) - Active: ${field.active}`)
      })
      console.log('\n')
    }

    // Verificar DocumentConfigs CNH (deve existir e estar ativo)
    const cnhDocConfigs = await prisma.documentConfig.findMany({
      where: {
        documentType: 'CNH',
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      }
    })

    console.log('═══════════════════════════════════════════════════════')
    console.log('📸 DOCUMENT CONFIGS (campos com câmera + OCR)')
    console.log('═══════════════════════════════════════════════════════\n')

    if (cnhDocConfigs.length === 0) {
      console.log('❌ PROBLEMA: Nenhum DocumentConfig CNH encontrado!\n')
      console.log('   Execute: node scripts/enable-cnh-document.js\n')
    } else {
      cnhDocConfigs.forEach(doc => {
        const scope = doc.eventId ? 'EVENT' : 'GLOBAL'
        const status = doc.active ? '✅ ATIVO' : '❌ INATIVO'
        const ocr = doc.enableOCR ? '✅ COM OCR' : '❌ SEM OCR'

        console.log(`  ${status} - ${doc.label}`)
        console.log(`    Scope: ${scope}`)
        console.log(`    OCR: ${ocr}`)
        console.log(`    Required: ${doc.required ? 'Sim' : 'Não'}`)
        console.log(`    Description: ${doc.description}`)
        console.log(`    Help: ${doc.helpText || 'N/A'}`)
        console.log('')
      })
    }

    // Verificar todos os campos ativos do evento
    const allActiveFields = await prisma.customField.findMany({
      where: {
        active: true,
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      },
      orderBy: { order: 'asc' }
    })

    console.log('═══════════════════════════════════════════════════════')
    console.log('📝 TODOS OS CUSTOM FIELDS ATIVOS')
    console.log('═══════════════════════════════════════════════════════\n')

    if (allActiveFields.length === 0) {
      console.log('  (Nenhum campo personalizado ativo)\n')
    } else {
      allActiveFields.forEach(field => {
        const scope = field.eventId ? 'EVENT' : 'GLOBAL'
        console.log(`  - ${field.label} (${field.fieldName}) [${scope}]`)
      })
      console.log('')
    }

    // Verificar todos os DocumentConfigs ativos
    const allActiveDocConfigs = await prisma.documentConfig.findMany({
      where: {
        active: true,
        OR: [
          { eventId: event.id },
          { eventId: null }
        ]
      },
      orderBy: { order: 'asc' }
    })

    console.log('═══════════════════════════════════════════════════════')
    console.log('📸 TODOS OS DOCUMENT CONFIGS ATIVOS')
    console.log('═══════════════════════════════════════════════════════\n')

    if (allActiveDocConfigs.length === 0) {
      console.log('  (Nenhum documento ativo)\n')
    } else {
      allActiveDocConfigs.forEach(doc => {
        const scope = doc.eventId ? 'EVENT' : 'GLOBAL'
        const ocr = doc.enableOCR ? '[OCR]' : '[NO-OCR]'
        console.log(`  - ${doc.label} (${doc.documentType}) ${ocr} [${scope}]`)
      })
      console.log('')
    }

    // Resumo final
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 RESUMO FINAL')
    console.log('═══════════════════════════════════════════════════════\n')

    const hasCustomFieldCNH = cnhCustomFields.length > 0
    const hasDocConfigCNH = cnhDocConfigs.some(d => d.active)
    const hasConflict = hasCustomFieldCNH && hasDocConfigCNH

    if (hasConflict) {
      console.log('❌ CONFLITO DETECTADO!')
      console.log('   Existem AMBOS CustomField e DocumentConfig para CNH')
      console.log('   Execute: node scripts/remove-cnh-custom-field.js\n')
    } else if (!hasDocConfigCNH) {
      console.log('⚠️  CNH NÃO ESTÁ CONFIGURADO')
      console.log('   Execute: node scripts/enable-cnh-document.js\n')
    } else if (hasDocConfigCNH && !hasCustomFieldCNH) {
      console.log('✅ CONFIGURAÇÃO CORRETA!')
      console.log('   CNH está como DocumentConfig com OCR')
      console.log('   Interface: Câmera + Arquivo')
      console.log('   OCR: Ativo\n')
      console.log('🎉 Tudo pronto! Recarregue a página:')
      console.log('   http://localhost:3000/?event=mega-feira-2025\n')
    }

  } catch (error) {
    console.error('\n❌ Erro:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
