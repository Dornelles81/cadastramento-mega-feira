/**
 * Troca a senha de um login do painel (EventAdmin) — em PRODUÇÃO.
 *
 * Não existe tela para isso: /admin/super/admins só cria e ativa/desativa, e o
 * PATCH de /api/admin/event-admins/[id] só aceita `isActive`. Este script é o
 * caminho, e foi feito para a senha nova NUNCA sair do seu terminal:
 *   - é digitada às cegas (sem eco), duas vezes;
 *   - não é aceita por argumento, variável de ambiente nem pipe — nada disso
 *     fica fora do histórico do shell ou do log de quem rodou;
 *   - não é impressa, nem gravada em lugar nenhum além do hash bcrypt.
 *
 * Rode numa janela de terminal PRÓPRIA — não pelo prefixo `!` do Claude Code,
 * que mandaria a sessão para a conversa.
 *
 * Uso:
 *   node_modules\.bin\tsx.cmd scripts\trocar-senha-admin.ts megafeira@megafeira.com
 *
 * ATENÇÃO — a troca NÃO derruba sessões abertas. A sessão é um JWT de 24h
 * (pages/api/auth/[...nextauth].ts) que nada invalida; quem já estiver logado
 * continua até expirar. Para cortar todas as sessões na hora, troque o
 * NEXTAUTH_SECRET na Vercel e faça redeploy (todo mundo precisa entrar de novo).
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as readline from 'readline'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { decryptToString } from '../lib/crypto'

const MIN = 16

// SHA-256 de senhas que já circularam em texto no repositório ou em docs. Vão
// como hash, não em claro: este arquivo é público, e reescrevê-las aqui seria
// mais uma cópia. A senha atual do próprio admin é checada pelo bcrypt.
const JA_EXPOSTAS_SHA256 = new Set([
  '9013b5863c7ba17a870fb25e9b89e385744e7a3bc66f1299041438f7c82f3c68',
  'e88d1d54f0dc53dc11841a089569a8db489a6d903a2e15e35f72d2c46afd3a33',
  '3ba2b452971a2af611742b23c2f31bd6b4dcaf2094c7ee0c45528a9cf77ed174',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
])

function perguntar(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a.trim()) }))
}

/** Lê uma linha sem ecoar o que é digitado. */
function perguntarOculto(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  let mudo = false
  ;(rl as any)._writeToOutput = (s: string) => { if (!mudo) process.stdout.write(s) }
  return new Promise((resolve) => {
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a) })
    mudo = true // o prompt já foi escrito; daqui em diante nada ecoa
  })
}

function hostDe(url?: string): string {
  const m = /@([^/:?]+)/.exec(url ?? '')
  return m ? m[1] : '(ilegível)'
}

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  if (!email) throw new Error('Informe o e-mail: tsx scripts/trocar-senha-admin.ts <email>')
  if (!process.stdin.isTTY) {
    throw new Error('Rode num terminal interativo. Senha por pipe/arquivo não é aceita (ficaria no histórico).')
  }

  const admin = await prisma.eventAdmin.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, isActive: true, password: true }
  })
  if (!admin) throw new Error(`Nenhum login com o e-mail ${email}`)

  console.log('')
  console.log(`Banco     : ${hostDe(process.env.DATABASE_URL)}`)
  console.log(`Login     : ${admin.email} (${admin.name}) — ${admin.role}${admin.isActive ? '' : ' — INATIVO'}`)
  console.log('')
  const ok = await perguntar('Trocar a senha deste login neste banco? Digite SIM: ')
  if (ok !== 'SIM') { console.log('Cancelado. Nada foi alterado.'); return }

  const nova = await perguntarOculto(`Senha nova (mínimo ${MIN} caracteres, não aparece na tela): `)
  const repetida = await perguntarOculto('Repita a senha nova: ')

  if (nova !== repetida) throw new Error('As duas digitações não conferem. Nada foi alterado.')
  if (nova.length < MIN) throw new Error(`Senha com menos de ${MIN} caracteres. Nada foi alterado.`)
  if (nova !== nova.trim()) throw new Error('Senha começa ou termina com espaço. Nada foi alterado.')
  if (JA_EXPOSTAS_SHA256.has(createHash('sha256').update(nova).digest('hex'))) {
    throw new Error('Essa senha já apareceu em texto no repositório. Nada foi alterado.')
  }
  if (await bcrypt.compare(nova, admin.password)) throw new Error('É a senha atual. Nada foi alterado.')

  // Não reaproveitar a senha dos terminais — foi exatamente o que expôs as duas.
  const terminais = await prisma.terminal.findMany({ where: { passwordEncrypted: { not: null } }, select: { passwordEncrypted: true } })
  for (const t of terminais) {
    let s: string | null = null
    try { s = decryptToString(Buffer.from(t.passwordEncrypted!)) } catch { /* ilegível: não compara */ }
    if (s !== null && s === nova) throw new Error('É a senha de um terminal. Use uma diferente. Nada foi alterado.')
  }

  const hash = await bcrypt.hash(nova, 10)
  await prisma.$transaction([
    prisma.eventAdmin.update({ where: { id: admin.id }, data: { password: hash } }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'ADMIN_PASSWORD_CHANGED',
        entityType: 'admin',
        entityId: admin.id,
        actorType: 'script',
        actorIdentifier: 'scripts/trocar-senha-admin.ts',
        description: `Senha do login ${admin.email} trocada por script local`,
        severity: 'WARNING'
      }
    })
  ])

  // Prova de gravação sem mostrar nada: o hash salvo confere com o digitado.
  const salvo = await prisma.eventAdmin.findUnique({ where: { id: admin.id }, select: { password: true } })
  const confere = !!salvo && (await bcrypt.compare(nova, salvo.password))
  console.log('')
  console.log(confere ? '✓ Senha trocada e conferida no banco.' : '✗ Gravou, mas a conferência falhou — verifique antes de sair do painel.')
  console.log('  Sessões já abertas continuam válidas por até 24h. Para cortá-las: trocar NEXTAUTH_SECRET na Vercel + redeploy.')
}

main()
  .catch((e) => { console.error(`\n✗ ${e?.message ?? e}`); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
