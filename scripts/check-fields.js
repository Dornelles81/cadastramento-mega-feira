const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const fields = await prisma.customField.findMany({
    where: {
      NOT: {
        fieldName: {
          startsWith: '_system_'
        }
      }
    },
    select: {
      id: true,
      fieldName: true,
      label: true,
      eventId: true,
      active: true,
      event: {
        select: {
          name: true,
          code: true
        }
      }
    }
  })

  console.log('Custom Fields:', JSON.stringify(fields, null, 2))

  await prisma.$disconnect()
}

main()
