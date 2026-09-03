/**
 * Política de retry das linhas de `ParticipantTerminalSync` — FONTE ÚNICA.
 *
 * Estas regras definem o que significa "ainda vai tentar de novo", QUANDO vai
 * tentar, e o que significa "desistiu". Precisam ser as MESMAS em três lugares
 * que não se falam:
 *
 *   - `/api/agent/ack`, que grava a próxima tentativa quando algo falha;
 *   - `/api/agent/work`, que decide quais linhas re-serve ao agente;
 *   - a tela de saúde e a de falhas, que contam quantas linhas "falharam".
 *
 * Se divergirem, a tela mente: mostraria como falha definitiva uma linha que o
 * agente ainda vai retomar, ou (pior) contaria como saudável uma linha que
 * ninguém mais vai tentar. Por isso os números moram aqui.
 *
 * ── Por que existem DUAS classes de erro (2026-09-02) ──────────────────────
 * O teto único de 8 tentativas com espera fixa de 60s aplicava a mesma regra a
 * dois problemas opostos:
 *
 *   PERMANENTE — `badJsonContent errorMsg=faceURL`: a foto passa de ~200 KB e o
 *     FDLib recusa. A mesma imagem vai falhar para sempre. Aqui 8 tentativas em
 *     4 terminais são 32 chamadas inúteis, e o operador só descobre no fim.
 *
 *   TRANSITÓRIA — `SubpicAnalysisModelingError`: o device detecta o rosto e não
 *     consegue extrair o template AGORA. Observado em produção em 2026-09-02:
 *     duas fotos falharam 8 vezes nos 4 terminais, foram devolvidas à fila sem
 *     alteração nenhuma na imagem, e carregaram. O erro é intermitente.
 *
 * O que condenava os transitórios não era o número 8 — era a JANELA. Com espera
 * fixa de 60s, as 8 tentativas se esgotavam em oito minutos: uma amostra só do
 * estado do device. O backoff exponencial mantém o mesmo volume de chamadas e
 * espalha as tentativas por horas, que é o que faz um erro dependente de carga
 * encontrar um momento bom — sem ninguém clicar em "Re-tentar", que é
 * exatamente o que não vai acontecer durante a feira.
 *
 * ── A classificação é DELIBERADAMENTE conservadora ─────────────────────────
 * Só entra em PERMANENTE o que temos evidência de ser determinístico. Errar
 * para o lado permanente abandona alguém que se recuperaria sozinho; errar para
 * o lado transitório custa algumas chamadas a mais e uma linha que demora um
 * pouco mais para aparecer como falha definitiva. O primeiro erro é caro, o
 * segundo é barato.
 */

/** Teto de tentativas para erro TRANSITÓRIO (ou não classificado). */
export const MAX_ATTEMPTS_TRANSITORIA = 12

/**
 * Teto de tentativas para erro PERMANENTE: 1. A primeira tentativa já
 * aconteceu (foi ela que produziu o erro); repetir produz o mesmo resultado.
 * Vai direto para a tela, onde um humano recaptura a foto.
 */
export const MAX_ATTEMPTS_PERMANENTE = 1

/**
 * Teto histórico, mantido como o MAIOR dos dois para quem só precisa de um
 * número de referência (ex.: texto de tela "linhas que bateram o teto de N").
 * A decisão real é sempre por `isExhausted`, que olha o erro.
 */
export const MAX_ATTEMPTS = MAX_ATTEMPTS_TRANSITORIA

/** Primeira espera; dobra a cada tentativa. */
export const RETRY_BACKOFF_MS = 60_000

/** Teto da espera: 128 min. Sem isto, a 12ª tentativa cairia em ~34 horas. */
export const RETRY_BACKOFF_MAX_MS = 128 * 60_000

export type ClasseErro = 'permanente' | 'transitoria'

/**
 * Assinaturas de erro DETERMINÍSTICO do device. Lista mínima de propósito —
 * ver "a classificação é conservadora" acima. Cada entrada aqui precisa de
 * evidência de que repetir não muda o resultado.
 *
 * `badJsonContent` + `faceURL`: foto acima do limite do FDLib (~200 KB). Ver
 * `lib/face/size-limit.ts`; o corte observado está entre 134 KB e 201 KB.
 */
const ASSINATURAS_PERMANENTES: Array<{ nome: string; termos: string[] }> = [
  {
    nome: 'foto-grande-demais',
    // Os DOIS termos juntos: `badJsonContent` sozinho é genérico demais, e
    // classificar genérico como permanente é o erro caro.
    termos: ['badjsoncontent', 'faceurl']
  }
]

/**
 * A MESMA regra em três formatos, porque três consumidores a consultam de
 * jeitos diferentes: o `/work` em JS, a tela de falhas num `where` do Prisma e
 * a tela de saúde num agregado SQL. Os três derivam da lista acima — acrescentar
 * uma assinatura lá muda os três de uma vez, que é o ponto deste módulo.
 */

/**
 * Classifica a falha pelo texto do erro que o device devolveu.
 * Sem erro conhecido → TRANSITÓRIA (o lado barato de errar).
 */
export function classificarErro(lastError: string | null | undefined): ClasseErro {
  if (!lastError) return 'transitoria'
  const e = lastError.toLowerCase()
  return ASSINATURAS_PERMANENTES.some((a) => a.termos.every((t) => e.includes(t)))
    ? 'permanente'
    : 'transitoria'
}

/**
 * Fragmento `where` do Prisma para "esgotou o teto". Use em QUALQUER contagem
 * de falhas — é o que garante que a tela conte exatamente o que o `/work`
 * deixou de servir.
 */
export function whereEsgotada(): any {
  return {
    OR: [
      { attempts: { gte: MAX_ATTEMPTS_TRANSITORIA } },
      ...ASSINATURAS_PERMANENTES.map((a) => ({
        AND: [
          { attempts: { gte: MAX_ATTEMPTS_PERMANENTE } },
          ...a.termos.map((t) => ({ lastError: { contains: t, mode: 'insensitive' as const } }))
        ]
      }))
    ]
  }
}

/**
 * A mesma condição como expressão booleana SQL, para os agregados crus.
 * `col` permite prefixar com alias de tabela quando necessário.
 */
export function sqlEsgotada(col = '"lastError"', attemptsCol = 'attempts'): string {
  const permanentes = ASSINATURAS_PERMANENTES.map(
    (a) =>
      `(${attemptsCol} >= ${MAX_ATTEMPTS_PERMANENTE} AND ` +
      a.termos.map((t) => `lower(${col}) LIKE '%${t}%'`).join(' AND ') +
      ')'
  )
  return `(${attemptsCol} >= ${MAX_ATTEMPTS_TRANSITORIA}${permanentes.length ? ' OR ' + permanentes.join(' OR ') : ''})`
}

/** Teto de tentativas que vale para esta falha. */
export function tetoDe(lastError: string | null | undefined): number {
  return classificarErro(lastError) === 'permanente'
    ? MAX_ATTEMPTS_PERMANENTE
    : MAX_ATTEMPTS_TRANSITORIA
}

/**
 * Espera até a PRÓXIMA tentativa, dado quantas já aconteceram.
 * 1ª falha → 1 min, 2ª → 2, 4, 8, 16, 32, 64, 128, 128, 128...
 *
 * Com teto de 12 tentativas, cobre ~10 horas — atravessa uma noite inteira de
 * feira sem ninguém olhando a tela.
 */
export function backoffMs(attempts: number): number {
  const n = Math.max(0, attempts - 1)
  const bruto = RETRY_BACKOFF_MS * Math.pow(2, n)
  return Math.min(bruto, RETRY_BACKOFF_MAX_MS)
}

/**
 * Quando esta linha pode ser servida de novo. `null` = nunca mais (esgotou o
 * teto da classe dela) — é o que o `/ack` grava para a linha parar de aparecer
 * no `/work` sem depender de nenhuma outra checagem.
 */
export function proximaTentativa(
  attempts: number,
  lastError: string | null | undefined,
  agora: Date = new Date()
): Date | null {
  if (attempts >= tetoDe(lastError)) return null
  return new Date(agora.getTime() + backoffMs(attempts))
}

/**
 * A linha esgotou as tentativas? Depende da CLASSE do erro — um
 * `badJsonContent` esgota na primeira, um transitório só na 12ª.
 *
 * O segundo parâmetro é opcional para não quebrar chamadas antigas, mas quem
 * conta falhas na tela DEVE passá-lo: sem o erro, uma linha permanente com 1
 * tentativa não seria contada como falha e sumiria da tela do operador.
 */
export function isExhausted(attempts: number, lastError?: string | null): boolean {
  return attempts >= tetoDe(lastError)
}
