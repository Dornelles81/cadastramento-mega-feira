/**
 * Termo de consentimento LGPD biométrico — TEMPLATE VERSIONADO NO REPO.
 *
 * Decisão (2026-06-19): o corpo do termo vive aqui, versionado por git
 * (prova forte de qual é o texto de cada versão). Os campos VARIÁVEIS por
 * evento (nome, datas, local, retenção, contato, meio alternativo) são
 * injetados em runtime por `renderConsent`.
 *
 * Ativação é POR EVENTO: só entra para um evento cujo
 * `EventConfig.consentTermVersion` aponte para uma versão existente aqui.
 * Enquanto nenhum evento aponta, este módulo fica inerte e o fluxo atual
 * (modal hard-coded) segue idêntico. Ver FOLLOWUPS.md › GO-LIVE EXPOFEST.
 *
 * No aceite, o servidor carimba no participante a VERSÃO aceita
 * (`Participant.consentTermVersion`) e um SNAPSHOT do texto exato renderizado
 * (`Participant.consentText`) — prova imutável, mesmo que o termo evolua.
 */

export interface ConsentVars {
  /** Nome do evento (ex.: "Expofest 2026") */
  evento: string
  /** Data de início, já formatada pt-BR (ex.: "15/08/2026") */
  dataInicio: string
  /** Data de término, já formatada pt-BR */
  dataFim: string
  /** Local do evento (venue + cidade/UF) */
  local: string
  /** Dias de retenção após o término (LGPD) */
  retencaoDias: number
  /** Meio alternativo de credenciamento sem biometria */
  meioAlternativo: string
  /** Canal de contato para exercer direitos do titular */
  contato: string
}

interface ConsentTemplate {
  version: string
  /** Corpo fixo com placeholders `{{chave}}`. */
  body: string
}

/**
 * Versão vigente do termo. Ao publicar uma nova versão, adicione uma entrada
 * em TEMPLATES e aponte os eventos para ela — NUNCA edite o corpo de uma
 * versão já aceita por alguém (quebraria a prova do snapshot).
 */
export const CURRENT_CONSENT_VERSION = '1.0'

const TEMPLATES: Record<string, ConsentTemplate> = {
  // ⚠️ CORPO PROVISÓRIO — aguardando o texto jurídico v1.0 do usuário.
  // NÃO é exibido a ninguém: nenhum evento aponta consentTermVersion='1.0'
  // até o texto real entrar aqui e a ativação ser feita.
  '1.0': {
    version: '1.0',
    body: [
      'TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS BIOMÉTRICOS',
      '',
      '[AGUARDANDO TEXTO JURÍDICO v1.0 — substituir este corpo pelo termo aprovado.]',
      '',
      'Evento: {{evento}}',
      'Período: {{dataInicio}} a {{dataFim}}',
      'Local: {{local}}',
      'Retenção: os dados biométricos são mantidos por {{retencaoDias}} dias após o',
      'término do evento e então excluídos automaticamente.',
      'Meio alternativo (sem biometria): {{meioAlternativo}}',
      'Contato para exercer seus direitos: {{contato}}',
    ].join('\n'),
  },
}

export function getConsentTemplate(version?: string | null): ConsentTemplate | null {
  if (!version) return null
  return TEMPLATES[version] ?? null
}

/** True se a versão existe no registry (gate de ativação). */
export function isConsentVersionValid(version?: string | null): boolean {
  return !!version && !!TEMPLATES[version]
}

/**
 * Renderiza o corpo da versão dada com as variáveis do evento.
 * Retorna `null` se a versão não existir (evento não ativou / versão inválida).
 */
export function renderConsent(version: string | null | undefined, vars: ConsentVars): string | null {
  const tpl = getConsentTemplate(version)
  if (!tpl) return null
  return tpl.body
    .replace(/\{\{\s*evento\s*\}\}/g, vars.evento)
    .replace(/\{\{\s*dataInicio\s*\}\}/g, vars.dataInicio)
    .replace(/\{\{\s*dataFim\s*\}\}/g, vars.dataFim)
    .replace(/\{\{\s*local\s*\}\}/g, vars.local)
    .replace(/\{\{\s*retencaoDias\s*\}\}/g, String(vars.retencaoDias))
    .replace(/\{\{\s*meioAlternativo\s*\}\}/g, vars.meioAlternativo)
    .replace(/\{\{\s*contato\s*\}\}/g, vars.contato)
}

type EventLike = {
  name: string
  startDate: Date | string
  endDate: Date | string
  venueName?: string | null
  venueAddress?: string | null
  venueCity?: string | null
  venueState?: string | null
  organizerEmail?: string | null
}

const DEFAULT_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '90', 10)
const DEFAULT_CONTATO = process.env.PRIVACY_CONTACT || 'privacidade@megacredenciamento.com.br'
const DEFAULT_MEIO_ALTERNATIVO =
  'credenciamento presencial na secretaria do evento, sem coleta de dado biométrico facial'

/** Erro de corrida: o termo mudou entre o carregamento da página e o envio. */
export class ConsentVersionMismatch extends Error {
  constructor(public expected: string | null, public got: string | null | undefined) {
    super('consent term version mismatch')
    this.name = 'ConsentVersionMismatch'
  }
}

export interface ConsentStamp {
  /** Versão a carimbar no participante (null = fluxo antigo, nada a carimbar). */
  consentTermVersion: string | null
  /** Snapshot do texto exato aceito (null = fluxo antigo). */
  consentText: string | null
}

type EventWithConfig = EventLike & { eventConfigs?: { consentTermVersion?: string | null } | null }

/**
 * Resolve o que carimbar no aceite, SERVER-AUTHORITATIVE.
 *  - Evento sem versão ativa → não carimba nada (mantém o fluxo antigo).
 *  - Evento com versão ativa → exige que o cliente ECOE a mesma versão que
 *    exibiu (proteção de corrida: termo atualizado com a página aberta →
 *    `ConsentVersionMismatch`, a UI pede refresh). O texto carimbado é
 *    re-renderizado AQUI a partir do DB — nunca confiamos no texto do cliente.
 */
export function resolveConsentStamp(
  event: EventWithConfig,
  clientVersion: string | null | undefined,
  opts?: { retentionDays?: number }
): ConsentStamp {
  const active = isConsentVersionValid(event.eventConfigs?.consentTermVersion)
    ? event.eventConfigs!.consentTermVersion!
    : null
  if (!active) return { consentTermVersion: null, consentText: null }
  if (clientVersion !== active) throw new ConsentVersionMismatch(active, clientVersion)
  return { consentTermVersion: active, consentText: renderConsent(active, buildConsentVars(event, opts)) }
}

/** Monta as variáveis do termo a partir de um evento (fonte da verdade = DB). */
export function buildConsentVars(ev: EventLike, opts?: { retentionDays?: number }): ConsentVars {
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const cidadeUf = ev.venueCity && ev.venueState ? `${ev.venueCity}/${ev.venueState}` : null
  const local =
    [ev.venueName, cidadeUf || ev.venueAddress].filter(Boolean).join(' — ') || 'local do evento'
  return {
    evento: ev.name,
    dataInicio: fmt(ev.startDate),
    dataFim: fmt(ev.endDate),
    local,
    retencaoDias: opts?.retentionDays ?? DEFAULT_RETENTION_DAYS,
    meioAlternativo: DEFAULT_MEIO_ALTERNATIVO,
    contato: ev.organizerEmail || DEFAULT_CONTATO,
  }
}
