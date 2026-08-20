/**
 * TRAVA DE BANCO PARA OS TESTES (Camada 1).
 *
 * Os testes de `scripts/test-*.ts` CRIAM E APAGAM dados reais: eventos,
 * terminais, participantes, tokens. Até 20/08/2026 eles rodavam contra
 * PRODUÇÃO, porque `.env` e `.env.local` apontam para o mesmo banco Neon e não
 * havia nada verificando. Um teste esquecido no meio da preparação da feira
 * escreveria em cima dos cadastros do evento.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ REGRA: falhar FECHADO. A trava não tenta reconhecer "é teste" — ela      ║
 * ║ reconhece PRODUÇÃO e, diante de host DESCONHECIDO, RECUSA.              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * A ordem importa: uma lista de "bancos proibidos" deixa passar tudo que ainda
 * não foi listado — e o banco novo de amanhã entra nessa categoria. Uma lista
 * de "bancos permitidos" erra para o lado seguro: o pior caso é um teste que
 * se recusa a rodar até alguém liberar o host explicitamente.
 *
 * ── Por que a leitura do env acontece DENTRO da função ──────────────────────
 * Import é içado (hoisted): num `import { assertBancoDeTeste } from './_guard'`
 * o módulo é avaliado ANTES da linha `dotenv.config(...)` do script que o
 * importa. Se este arquivo lesse `process.env.DATABASE_URL` no topo, leria
 * antes do dotenv popular e concluiria qualquer coisa. Por isso só a CHAMADA
 * lê o ambiente — e ela tem que vir depois do `dotenv.config()`.
 *
 * ── Como liberar um banco de teste (sem editar este arquivo) ────────────────
 *   $env:BANCOS_DE_TESTE = 'ep-meu-branch-de-teste'      # PowerShell
 *   export BANCOS_DE_TESTE='ep-meu-branch-de-teste'      # bash
 * Aceita vários, separados por vírgula. É por aqui que o branch Neon da
 * Camada 2 entra, quando existir.
 */

/** Endpoints de PRODUÇÃO. Presença aqui = recusa, com mensagem específica. */
const PRODUCAO = [
  'ep-wandering-waterfall-acykvygu' // Neon sa-east-1 (pooler e direto)
]

/** Hosts sempre seguros: nada aqui é banco de gente de verdade. */
const SEGUROS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal'
]

/**
 * Escape hatch DELIBERADAMENTE incômodo. Frase exata, não `=1`, para que não
 * caia num perfil de shell nem num CI por acidente.
 */
const FRASE_DE_LIBERACAO = 'sim, eu sei o que estou fazendo'
const VAR_LIBERACAO = 'PERMITIR_BANCO_DE_PRODUCAO'

function hostDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    // postgresql://user:senha@HOST:porta/base?params
    return new URL(url).hostname.toLowerCase()
  } catch {
    // URL exótica (senha com caractere não escapado, etc.): extrai na mão em
    // vez de devolver null, senão um parse que falha viraria "sem banco" e a
    // trava passaria batido justamente no caso mais bagunçado.
    const m = url.match(/@([^/:?]+)/)
    return m ? m[1].toLowerCase() : null
  }
}

function ehProducao(host: string): boolean {
  return PRODUCAO.some((p) => host.includes(p))
}

function ehLiberado(host: string): boolean {
  if (SEGUROS.includes(host)) return true
  const extras = (process.env.BANCOS_DE_TESTE ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return extras.some((e) => host.includes(e))
}

function aborta(motivo: string, host: string | null, contexto: string): never {
  const linhas = [
    '',
    '╔═══════════════════════════════════════════════════════════════════════╗',
    '║  TESTE ABORTADO PELA TRAVA DE BANCO                                   ║',
    '╚═══════════════════════════════════════════════════════════════════════╝',
    `  teste  : ${contexto}`,
    `  host   : ${host ?? '(DATABASE_URL ausente ou ilegível)'}`,
    `  motivo : ${motivo}`,
    '',
    '  Estes testes CRIAM E APAGAM dados reais. Aponte para um banco de teste:',
    '',
    "    $env:DATABASE_URL    = 'postgresql://...seu-branch-de-teste...'",
    "    $env:DIRECT_URL      = 'postgresql://...seu-branch-de-teste...'",
    "    $env:BANCOS_DE_TESTE = 'ep-seu-branch-de-teste'",
    '',
    '  AS DUAS URLs precisam sair de producao. Redirecionar so a DATABASE_URL',
    '  deixa a DIRECT_URL do .env.local apontando para producao - e e por ela',
    '  que as migrations passam. A trava recusa enquanto qualquer uma das duas',
    '  estiver em producao ou em host desconhecido.',
    '',
    '  A variável de shell vence o .env e o .env.local (verificado).',
    '',
    `  Se você REALMENTE precisa rodar contra produção, exporte:`,
    `    $env:${VAR_LIBERACAO} = '${FRASE_DE_LIBERACAO}'`,
    ''
  ]
  console.error(linhas.join('\n'))
  process.exit(1)
}

/**
 * Chame como PRIMEIRA instrução depois do `dotenv.config(...)`, antes de
 * qualquer query. Aborta o processo (exit 1) se o banco não for reconhecido
 * como de teste.
 */
export function assertBancoDeTeste(contexto = 'script'): void {
  if (process.env[VAR_LIBERACAO] === FRASE_DE_LIBERACAO) {
    console.warn(
      `[trava] ${VAR_LIBERACAO} presente - rodando SEM protecao, por escolha explicita. ` +
        `Host: ${hostDe(process.env.DATABASE_URL) ?? '?'}`
    )
    return
  }

  // DIRECT_URL entra na checagem: migrations e alguns caminhos do Prisma usam
  // ele, e adiantaria pouco proteger uma das duas pontas.
  for (const [nome, url] of [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['DIRECT_URL', process.env.DIRECT_URL]
  ] as const) {
    if (!url) continue
    const host = hostDe(url)
    if (!host) aborta(`${nome} presente mas ilegivel`, null, contexto)
    if (ehProducao(host)) aborta(`${nome} aponta para o banco de PRODUCAO`, host, contexto)
    if (!ehLiberado(host)) {
      aborta(
        `${nome} aponta para host DESCONHECIDO (a trava recusa por padrao; ` +
          'libere em BANCOS_DE_TESTE se for de teste)',
        host,
        contexto
      )
    }
  }

  if (!process.env.DATABASE_URL) {
    aborta('DATABASE_URL ausente', null, contexto)
  }

  console.log(`[trava] banco de teste OK: ${hostDe(process.env.DATABASE_URL)}`)
}
