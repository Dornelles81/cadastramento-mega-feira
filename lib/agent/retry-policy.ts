/**
 * Política de retry das linhas de `ParticipantTerminalSync` — FONTE ÚNICA.
 *
 * Estas constantes definem o que significa "ainda vai tentar de novo" e o que
 * significa "desistiu". Precisam ser as MESMAS em dois lugares que hoje não se
 * falam:
 *
 *   - `/api/agent/work`, que decide quais linhas `failed` ainda re-serve;
 *   - a tela de saúde do sync, que conta quantas linhas "falharam".
 *
 * Se divergirem, a tela mente: mostraria como falha definitiva uma linha que o
 * agente ainda vai retomar, ou (pior) contaria como saudável uma linha que
 * ninguém mais vai tentar. Por isso o número mora aqui, e não duplicado nos
 * dois arquivos.
 */

/** Espera mínima antes de re-servir uma linha que falhou. */
export const RETRY_BACKOFF_MS = 60_000

/**
 * Teto de tentativas por linha. Ao atingir este número a linha para de ser
 * servida pelo `/work` — daí em diante é a reconciliação ou o operador que
 * assume. É exatamente esta a definição de FALHA na tela de saúde.
 */
export const MAX_ATTEMPTS = 8

/**
 * A linha esgotou as tentativas? Espelha o critério do `/work` (`attempts <
 * MAX_ATTEMPTS` para continuar tentando).
 */
export function isExhausted(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS
}
