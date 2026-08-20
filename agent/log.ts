/**
 * Log do agente com carimbo de hora em TODA linha.
 *
 * Por que no agente, e não só no NSSM: o `AppTimestampLog` do serviço só existe
 * quando o agente roda COMO SERVIÇO. No `--dry-run` e na execução manual pelo
 * console — as duas situações de diagnóstico, justamente quando a hora mais
 * importa — o NSSM não está no caminho e a linha sairia sem hora nenhuma.
 *
 * Carimbar aqui também sobrevive a redirecionamento simples
 * (`mega-agente.exe >> agente.log`), que é o modo documentado de rodar avulso.
 *
 * Consequência conhecida: rodando como serviço, a linha leva DOIS carimbos - o
 * do NSSM (hora local, momento da escrita no arquivo) e o nosso (UTC, momento
 * do evento). É redundante, mas os dois têm origem diferente e uma linha de
 * stack trace que escape do nosso código só recebe o do NSSM.
 *
 * ISO 8601 em UTC de propósito: ordenável como texto e sem ambiguidade de fuso
 * ou horário de verão num log que pode atravessar 58 dias de evento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ REGRA: mensagem de log é ASCII PURO. Sem acento, sem `·`, sem travessão. │
 * └──────────────────────────────────────────────────────────────────────────┘
 * Não é preciosismo. O Node escreve UTF-8, o NSSM grava os bytes crus, e o
 * `Get-Content` do PowerShell 5.1 lê arquivo sem BOM como CP1252 — então
 * "órfão removido" aparece como "Ã³rfÃ£o removido" para quem ler sem
 * `-Encoding UTF8`. Visto em 20/08/2026, na primeira subida do serviço no mini
 * PC: a linha `iniciado · base=...` saiu como `iniciado Â· base=...`.
 *
 * Existe a flag, mas depender dela é depender de alguém lembrar dela às 2 da
 * manhã, no meio de um evento. ASCII sai certo em qualquer leitor: Get-Content
 * sem flag, Notepad, `type`, colado num chat, aberto por outra pessoa.
 *
 * Vale para tudo que chega ao log, INCLUSIVE `new Error(...)` lançado em
 * api.ts/apply.ts — a mensagem do erro vira linha de log. Comentários e código
 * seguem em português normal, com acento: eles não vão para o arquivo.
 */

function carimbo(): string {
  return new Date().toISOString()
}

export function log(msg: string): void {
  console.log(`${carimbo()} ${msg}`)
}

export function logError(msg: string): void {
  console.error(`${carimbo()} ${msg}`)
}
