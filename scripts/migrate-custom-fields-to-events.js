/**
 * Migration Script: Assign Existing Custom Fields to Events
 *
 * This script migrates existing custom fields (that have eventId = null)
 * to be associated with specific events.
 *
 * Options:
 * 1. Assign all global fields to the default event (MEGA-FEIRA-2025)
 * 2. Duplicate fields for all existing events
 * 3. Keep fields as global templates (no changes)
 *
 * Usage:
 *   node scripts/migrate-custom-fields-to-events.js [option]
 *
 * Options:
 *   --assign-default     Assign all fields to MEGA-FEIRA-2025 (default)
 *   --duplicate-all      Duplicate fields for all events
 *   --list-only          Just list fields without making changes
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const mode = args[0] || '--assign-default'

  console.log('\n🔧 Custom Fields Migration Script')
  console.log('=' .repeat(50))

  try {
    // Get all custom fields with null eventId
    const globalFields = await prisma.customField.findMany({
      where: {
        eventId: null
      }
    })

    console.log(`\n📊 Found ${globalFields.length} global custom fields\n`)

    if (globalFields.length === 0) {
      console.log('✅ No migration needed - all fields are already assigned to events!')
      return
    }

    // List fields
    console.log('Current Global Fields:')
    globalFields.forEach(field => {
      console.log(`  - ${field.fieldName} (${field.label}) - Type: ${field.type}`)
    })
    console.log()

    if (mode === '--list-only') {
      console.log('ℹ️  List-only mode - no changes made')
      return
    }

    // Get all events
    const events = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        slug: true
      }
    })

    console.log(`📋 Found ${events.length} events:\n`)
    events.forEach(event => {
      console.log(`  - ${event.name} (${event.code})`)
    })
    console.log()

    if (events.length === 0) {
      console.log('❌ No events found! Please create at least one event first.')
      return
    }

    if (mode === '--assign-default') {
      // Option 1: Assign all fields to the first/default event
      const defaultEvent = events[0] // Use first event as default

      console.log(`🎯 Assigning all fields to: ${defaultEvent.name} (${defaultEvent.code})\n`)

      let updated = 0
      for (const field of globalFields) {
        await prisma.customField.update({
          where: { id: field.id },
          data: { eventId: defaultEvent.id }
        })
        console.log(`  ✅ Updated: ${field.fieldName}`)
        updated++
      }

      console.log(`\n✅ Migration complete! ${updated} fields assigned to ${defaultEvent.name}`)

    } else if (mode === '--duplicate-all') {
      // Option 2: Duplicate fields for all events
      console.log('🔄 Duplicating fields for all events...\n')

      let created = 0
      for (const event of events) {
        console.log(`\n📦 Creating fields for: ${event.name}`)

        for (const field of globalFields) {
          try {
            // Create a copy of the field for this event
            await prisma.customField.create({
              data: {
                eventId: event.id,
                fieldName: field.fieldName,
                label: field.label,
                type: field.type,
                required: field.required,
                placeholder: field.placeholder,
                options: field.options,
                validation: field.validation,
                order: field.order,
                active: field.active
              }
            })
            console.log(`  ✅ Created: ${field.fieldName}`)
            created++
          } catch (error) {
            // Field name might already exist for this event
            console.log(`  ⚠️  Skipped: ${field.fieldName} (may already exist)`)
          }
        }
      }

      console.log(`\n✅ Migration complete! ${created} field copies created across ${events.length} events`)

      // Optionally delete the global fields
      console.log('\n⚠️  Original global fields still exist (eventId=null)')
      console.log('💡 You can manually delete them or keep as templates')

    } else {
      console.log('❌ Unknown mode. Use --assign-default, --duplicate-all, or --list-only')
      process.exit(1)
    }

    console.log('\n' + '='.repeat(50))
    console.log('🎉 Migration script completed successfully!\n')

  } catch (error) {
    console.error('\n💥 Migration failed:', error)
    console.error('\nError details:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the migration
main()
  .then(() => {
    console.log('👋 Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
