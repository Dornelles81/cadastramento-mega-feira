/**
 * Validade temporal do acesso de um subject num contexto — §6 do documento de
 * arquitetura (docs/arquitetura-nucleo-modos.md).
 *
 * PONTO DE INDIREÇÃO (não engine): hoje existe um único modo, EVENTO, cuja
 * política é validade longa — fim em 2037 (teto do device DS-K1T671M-L, herança
 * 2038) — porque NINGUÉM pode expirar no meio do evento e o evento expurga no
 * fim. Modos futuros (escola: fim do ano letivo; condomínio: fim do contrato)
 * plugam AQUI, sem espalhar a constante 2037 pelo código.
 *
 * INVARIANTE (device-integration-plan): `end` SEMPRE longe — nunca data curta;
 * endTime curto faz o usuário expirar e sumir do terminal no meio do evento.
 *
 * O agente NÃO calcula validade: a nuvem manda o resultado pronto no /work; o
 * agente só aplica. Formato = o que o ISAPI `Valid` espera: 'YYYY-MM-DDTHH:MM:SS'.
 */

export interface ValidityWindow {
  begin: string
  end: string
}

/** Fim do mundo prático para o modo evento (teto do device). */
export const FAR_FUTURE_END = '2037-12-31T23:59:59'
const FAR_PAST_BEGIN = '2020-01-01T00:00:00'

/** Forma mínima do contexto de acesso (hoje `Event`); `mode` é semente futura. */
export type AccessContextLike = { mode?: string | null } | null | undefined

/**
 * Resolve a janela de validade do subject no contexto. Hoje retorna a política
 * do modo EVENTO independentemente do contexto (único modo). Os parâmetros
 * existem como costura: quando houver 2º modo, o switch entra AQUI.
 */
export function resolveValidity(
  _context?: AccessContextLike,
  _subject?: unknown
): ValidityWindow {
  return { begin: FAR_PAST_BEGIN, end: FAR_FUTURE_END }
}
