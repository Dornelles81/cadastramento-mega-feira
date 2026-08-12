/**
 * Diagnóstico temporário: verifica estado do admin e testa a senha.
 * Uso: npx tsx scripts/check-admin.ts <email> <senha>
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email) {
    console.log('Uso: npx tsx scripts/check-admin.ts <email> [senha]')
    const all = await prisma.eventAdmin.findMany({
      select: { email: true, name: true, role: true, isActive: true, lockedUntil: true, loginAttempts: true }
    })
    console.log('\nAdmins cadastrados:')
    for (const a of all) {
      console.log(` - ${a.email} | ${a.name} | ${a.role} | ativo=${a.isActive} | tentativas=${a.loginAttempts} | bloqueado até=${a.lockedUntil ?? '—'}`)
    }
    return
  }

  const admin = await prisma.eventAdmin.findUnique({ where: { email } })
  if (!admin) {
    console.log(`❌ Nenhum admin com email "${email}"`)
    return
  }

  console.log(`✅ Admin encontrado: ${admin.name} (${admin.role})`)
  console.log(`   ativo=${admin.isActive} | tentativas=${admin.loginAttempts} | bloqueado até=${admin.lockedUntil ?? '—'}`)
  console.log(`   hash começa com: ${admin.password.substring(0, 7)}...`)

  if (password) {
    const ok = await bcrypt.compare(password, admin.password)
    console.log(ok ? '✅ Senha CONFERE com o hash' : '❌ Senha NÃO confere com o hash')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
