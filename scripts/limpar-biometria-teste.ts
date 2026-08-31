/**
 * Expurga BIOMETRIA do banco de TESTE.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * O branch Neon `testes` foi criado a partir de production, então veio com os
 * rostos reais de centenas de participantes. O branch é PERMANENTE: sem isto,
 * seria uma segunda cópia de dado biométrico vivendo por tempo indeterminado,
 * fora do controle de retenção que o resto do sistema aplica. Teste não precisa
 * do rosto de ninguém — quem precisar de foto que gere imagem sintética.
 *
 * RODE ISTO SEMPRE que o branch de teste for recriado a partir de produção.
 *
 * ── Segurança do alvo ──────────────────────────────────────────────────────
 * Três camadas, porque um erro aqui apaga a biometria da FEIRA:
 *   1. `assertBancoDeTeste` (recusa produção e host desconhecido);
 *   2. a recusa explícita abaixo, que não depende de o `_guard` estar correto;
 *   3. `scripts/testar.ps1`, que confere o alvo antes de executar.
 *
 * ── O que limpa ────────────────────────────────────────────────────────────
 *   participants.faceData      (imagem cifrada — a biometria em si)
 *   participants.faceImageUrl  (caminho da imagem legada)
 *   participants.faceVersion   (hash sha256 do conteúdo da face)
 *
 * `faceVersion` vai junto por coerência: é derivado da face, e mantê-lo
 * apontando para um conteúdo que não existe mais deixaria a reconciliação
 * comparando contra um fantasma. Não é biometria (hash não reconstrói rosto),
 * mas sem a face não significa nada.
 *
 * Depois do UPDATE roda VACUUM FULL: no Postgres, sobrescrever com NULL deixa a
 * versão ANTIGA da linha no arquivo como tupla morta. Sem o VACUUM o expurgo é
 * cosmético — a imagem continua nas páginas da tabela e no TOAST.
 *
 * Uso:  .\scripts\testar.ps1 scripts\limpar-biometria-teste.ts            (dry-run)
 *       .\scripts\testar.ps1 scripts\limpar-biometria-teste.ts --aplicar
 */
import * as dotenv from 'dotenv'
import { assertBancoDeTeste } from './_guard'
dotenv.config({ path: '.env.local' })
assertBancoDeTeste('limpar-biometria-teste.ts')

import { prisma } from '../lib/prisma'

const APLICAR = process.argv.includes('--aplicar')

/** Camada 2: não confia só no _guard. Endpoint de produção = aborta, ponto. */
const PRODUCAO = 'ep-wandering-waterfall-acykvygu'
function conferirAlvo(): string {
  const url = process.env.DATABASE_URL ?? ''
  const host = (url.match(/@([^/:?]+)/)?.[1] ?? '').toLowerCase()
  if (!host) throw new Error('DATABASE_URL ausente ou ilegivel - abortado')
  if (host.includes(PRODUCAO)) {
    throw new Error('ALVO E PRODUCAO (' + host + ') - ABORTADO. Este script apaga biometria.')
  }
  return host
}

/**
 * VACUUM FULL nas tabelas, por conexão DIRETA (sem pgbouncer, fora de
 * transação). Reescreve a tabela: é o que de fato remove a imagem antiga do
 * arquivo, em vez de só apagá-la da linha visível.
 */
async function vacuum(tabelas: string[]) {
  const direct = process.env.DIRECT_URL
  if (!direct) {
    console.log('DIRECT_URL ausente - VACUUM FULL PULADO. O dado antigo continua')
    console.log('nas tuplas mortas ate um vacuum futuro.')
    return
  }
  // Import tardio: só este trecho precisa de um cliente separado.
  const { PrismaClient } = await import('@prisma/client')
  const cli = new PrismaClient({ datasources: { db: { url: direct } } })
  try {
    for (const t of tabelas) {
      console.log(`VACUUM FULL ${t} (reescreve a tabela; pode demorar)...`)
      await cli.$executeRawUnsafe(`VACUUM FULL ${t}`)
      console.log('  ok')
    }
  } finally {
    await cli.$disconnect()
  }
}

async function main() {
  const host = conferirAlvo()
  console.log('alvo :', host)
  console.log('modo :', APLICAR ? '*** APLICAR (vai apagar) ***' : 'dry-run')
  console.log('')

  const comFace = await prisma.participant.count({
    where: { OR: [{ faceData: { not: null } }, { faceImageUrl: { not: null } }] }
  })
  const total = await prisma.participant.count()
  const comVersao = await prisma.participant.count({ where: { faceVersion: { not: null } } })

  console.log('participantes            :', total)
  console.log('  com faceData/ImageUrl  :', comFace)
  console.log('  com faceVersion        :', comVersao)
  console.log('')

  // A biometria também vazava para o audit_logs (purgado em produção em
  // 23/08/2026). Como este branch é cópia, confere-se aqui de novo: se a cópia
  // for anterior ao purgo, o rosto está lá dentro.
  // Todos os campos Json do audit_logs, nao so um: a face podia entrar por
  // qualquer snapshot. `data:image` pega a data URL em claro; `faceData`, a
  // chave serializada.
  const CAMPOS_JSON = ['previousData', 'newData', 'changes', 'targetSnapshot', 'metadata']
  const condicao = CAMPOS_JSON
    .map(c => `"${c}"::text LIKE '%faceData%' OR "${c}"::text LIKE '%data:image%'`)
    .join(' OR ')

  const auditComFace = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS n FROM audit_logs WHERE ${condicao}`
  ).catch((e: any) => { console.log('  (falha ao varrer audit_logs:', e?.message, ')'); return [{ n: -1 }] })
  console.log('audit_logs com rastro de face:', auditComFace[0].n === -1 ? '(nao verificavel)' : auditComFace[0].n)
  console.log('')

  if (!APLICAR) {
    console.log('dry-run: nada foi alterado. Rode com --aplicar para expurgar.')
    return
  }

  const r = await prisma.participant.updateMany({
    where: { OR: [{ faceData: { not: null } }, { faceImageUrl: { not: null } }, { faceVersion: { not: null } }] },
    data: { faceData: null, faceImageUrl: null, faceVersion: null }
  })
  console.log('linhas atualizadas:', r.count)

  if (auditComFace[0].n > 0) {
    // Zera os cinco campos Json nas linhas atingidas. O registro do EVENTO
    // (quem, quando, o que) permanece: o que sai e o payload que carregava a
    // imagem. Auditoria sem rosto continua sendo auditoria.
    const sets = CAMPOS_JSON.map(c => `"${c}" = NULL`).join(', ')
    const ra = await prisma.$executeRawUnsafe(
      `UPDATE audit_logs SET ${sets} WHERE ${condicao}`
    )
    console.log('audit_logs limpos:', ra)
  }

  // VACUUM FULL: sem isto a imagem sobrevive nas tuplas mortas e o expurgo é
  // cosmético. Duas exigências que obrigam conexão PRÓPRIA:
  //   - VACUUM não roda dentro de bloco de transação;
  //   - não passa pelo pgbouncer (a DATABASE_URL é a com `-pooler`).
  // Por isso um cliente dedicado apontado para a DIRECT_URL.
  console.log('')
  await vacuum(['participants', ...(auditComFace[0].n > 0 ? ['audit_logs'] : [])])

  // ---------------------------------------------------------- conferencia
  console.log('')
  const restou = await prisma.participant.count({
    where: { OR: [{ faceData: { not: null } }, { faceImageUrl: { not: null } }, { faceVersion: { not: null } }] }
  })
  console.log('CONFERENCIA - participantes com qualquer rastro de face:', restou)
  console.log(restou === 0 ? 'EXPURGO COMPLETO.' : 'AINDA HA RESTO - investigar.')
}

main()
  .catch(e => { console.error('ERRO:', e?.message ?? e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
