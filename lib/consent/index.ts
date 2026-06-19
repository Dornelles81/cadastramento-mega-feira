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
  /** Dados de identificação pedidos no formulário (ex.: "nome, CPF, e-mail e telefone") */
  camposColetados: string
  /** Usos do dado além da entrada; vazio se for só controle de acesso */
  finalidadesAdicionais: string
  /** Canal de contato para exercer direitos (não usado na v1.0 — DPO fixo no corpo) */
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
  // v1.0 PROVISÓRIA — pendente de revisão jurídica. Se o jurídico alterar algo,
  // criar uma nova versão (1.1/2.0); NUNCA editar este corpo após alguém aceitar
  // (quebraria a prova do snapshot). Dados fixos da Controladora estão no corpo.
  '1.0': {
    version: '1.0',
    body: `TERMO DE CONSENTIMENTO PARA COLETA E TRATAMENTO DE DADO BIOMÉTRICO FACIAL

Controle de Acesso por Reconhecimento Facial — {{evento}}

1. Quem coleta seus dados (Controlador)

Os seus dados pessoais são coletados e tratados por Mega Feira Tecnologia para Acessos Ltda, inscrita no CNPJ sob nº 32.311.191/0001-07, com sede na Rua São Joaquim, 1085, Centro, São Leopoldo/RS, doravante denominada "Controladora".

Encarregado de Dados (DPO): Luís Eduardo Dornelles — dornelles@megafeira.com

Esta coleta refere-se ao evento {{evento}}, realizado em {{local}}, no período de {{dataInicio}} a {{dataFim}}.

2. Que dado é coletado

A Controladora coletará a sua imagem facial (fotografia do rosto) e dela extrairá um modelo biométrico (representação matemática dos traços do seu rosto) para fins de reconhecimento facial.

A imagem facial e o modelo biométrico são classificados pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018) como dado pessoal sensível (art. 5º, II, e art. 11), recebendo proteção reforçada.

São também coletados os dados de identificação informados no cadastro: {{camposColetados}}.

3. Para que seu dado será usado (Finalidade)

O seu dado biométrico facial será usado exclusivamente para o controle de acesso ao evento {{evento}} — permitir e registrar a sua entrada por reconhecimento facial, dispensando crachá físico.

{{finalidadesAdicionais}}

O seu dado biométrico não será usado para finalidade diversa da informada, não será vendido, nem compartilhado com terceiros para fins comerciais ou de marketing.

4. Como seu dado é protegido

A sua imagem facial é armazenada de forma criptografada (padrão AES-256-GCM), nunca em texto aberto. O acesso aos dados é restrito e controlado. O modelo biométrico enviado aos terminais de acesso trafega de forma protegida.

5. Por quanto tempo seu dado é guardado (Retenção)

O seu dado biométrico facial será mantido até o encerramento do evento {{evento}} e por até {{retencaoDias}} dias após o seu término, prazo após o qual será eliminado de forma definitiva dos nossos sistemas e dos terminais de acesso.

6. Seus direitos (art. 18 da LGPD)

A qualquer momento, gratuitamente, você pode: revogar este consentimento e solicitar a eliminação imediata do seu dado biométrico; confirmar se tratamos seus dados e acessá-los; corrigir dados incompletos ou desatualizados; solicitar a eliminação dos dados; obter informação sobre com quem compartilhamos seus dados.

Para exercer qualquer direito, contate: Luís Eduardo Dornelles (Encarregado de Dados) — dornelles@megafeira.com.

A revogação do consentimento ou a recusa em fornecer o dado biométrico não impede o seu acesso ao evento — será oferecido um meio alternativo de credenciamento: {{meioAlternativo}}.

7. Consentimento livre e informado

Ao marcar a opção de aceite e prosseguir com o cadastro, você declara que: leu e compreendeu este termo; tem 18 anos ou mais; e consente, de forma livre, informada e específica, com a coleta e o tratamento do seu dado biométrico facial para a finalidade descrita no item 3, no contexto do evento {{evento}}.`,
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
    .replace(/\{\{\s*camposColetados\s*\}\}/g, vars.camposColetados)
    .replace(/\{\{\s*finalidadesAdicionais\s*\}\}/g, vars.finalidadesAdicionais)
    .replace(/\{\{\s*contato\s*\}\}/g, vars.contato)
    // finalidadesAdicionais vazio deixa um parágrafo em branco — colapsa
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
const DEFAULT_MEIO_ALTERNATIVO = 'crachá com QR code, retirado na secretaria do evento'
const DEFAULT_CAMPOS_COLETADOS = 'nome, CPF, e-mail e telefone'
const DEFAULT_FINALIDADES_ADICIONAIS = '' // vazio = só controle de acesso (entrada)

/**
 * Campos variáveis do termo por evento. Hoje vêm de defaults sensatos; quando
 * houver UI de configuração do termo por evento, estes overrides serão lidos
 * do EventConfig (form real → camposColetados; usos extras → finalidadesAdicionais).
 */
export interface ConsentVarsOpts {
  retentionDays?: number
  meioAlternativo?: string
  camposColetados?: string
  finalidadesAdicionais?: string
}

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
  opts?: ConsentVarsOpts
): ConsentStamp {
  const active = isConsentVersionValid(event.eventConfigs?.consentTermVersion)
    ? event.eventConfigs!.consentTermVersion!
    : null
  if (!active) return { consentTermVersion: null, consentText: null }
  if (clientVersion !== active) throw new ConsentVersionMismatch(active, clientVersion)
  return { consentTermVersion: active, consentText: renderConsent(active, buildConsentVars(event, opts)) }
}

/** Monta as variáveis do termo a partir de um evento (fonte da verdade = DB). */
export function buildConsentVars(ev: EventLike, opts?: ConsentVarsOpts): ConsentVars {
  // timeZone UTC: as datas do evento são guardadas como meia-noite; sem fixar o
  // fuso, toLocaleDateString desloca um dia (servidor UTC vs. local UTC-3).
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
  const cidadeUf = ev.venueCity && ev.venueState ? `${ev.venueCity}/${ev.venueState}` : null
  const local =
    [ev.venueName, cidadeUf || ev.venueAddress].filter(Boolean).join(' — ') || 'local do evento'
  return {
    evento: ev.name,
    dataInicio: fmt(ev.startDate),
    dataFim: fmt(ev.endDate),
    local,
    retencaoDias: opts?.retentionDays ?? DEFAULT_RETENTION_DAYS,
    meioAlternativo: opts?.meioAlternativo ?? DEFAULT_MEIO_ALTERNATIVO,
    camposColetados: opts?.camposColetados ?? DEFAULT_CAMPOS_COLETADOS,
    finalidadesAdicionais: opts?.finalidadesAdicionais ?? DEFAULT_FINALIDADES_ADICIONAIS,
    contato: ev.organizerEmail || DEFAULT_CONTATO,
  }
}
