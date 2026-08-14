/**
 * Prazo RECOMENDADO de cadastro do evento.
 *
 * É orientação, nunca trava: serve só para o convite pedir que a pessoa se
 * antecipe ("assim sua credencial já estará pronta na chegada"). O cadastro
 * continua aberto durante todo o evento — não há, e não deve haver, nenhuma
 * validação que rejeite cadastro depois desta data.
 *
 * Origem do valor:
 *   1. event.registrationDeadline, quando o admin preencheu (campo opcional);
 *   2. senão, calculado: startDate menos DEFAULT_DAYS_BEFORE_START dias.
 *
 * Fuso: as datas do evento são gravadas ancoradas em 12:00Z (ver o PATCH em
 * pages/api/admin/eventos/[slug].ts), justamente para o dia do calendário não
 * escorregar entre UTC e America/Sao_Paulo. Por isso tudo aqui lê/escreve em
 * UTC — formatar com getDate() local devolveria o dia anterior em alguns fusos.
 */

/** Antecedência padrão, em dias, quando o evento não tem prazo próprio. */
export const DEFAULT_DAYS_BEFORE_START = 4;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RegistrationDeadlineSource {
  /** Prazo definido manualmente no evento (opcional). */
  registrationDeadline?: DateInput;
  /** Início do evento — base do cálculo quando não há prazo manual. */
  startDate?: DateInput;
}

/**
 * Resolve o prazo recomendado. Devolve null só se não houver nem prazo manual
 * nem data de início (evento incompleto) — nesse caso quem chama omite a linha.
 */
export function resolveRegistrationDeadline(event: RegistrationDeadlineSource): Date | null {
  const explicit = toDate(event.registrationDeadline);
  if (explicit) return explicit;

  const start = toDate(event.startDate);
  if (!start) return null;

  return new Date(start.getTime() - DEFAULT_DAYS_BEFORE_START * MS_PER_DAY);
}

/** dd/MM/aaaa a partir das partes UTC (ver nota de fuso no topo). */
export function formatDeadlineBR(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Atalho: prazo já formatado para o texto do convite, ou null. */
export function registrationDeadlineLabel(event: RegistrationDeadlineSource): string | null {
  const date = resolveRegistrationDeadline(event);
  return date ? formatDeadlineBR(date) : null;
}
