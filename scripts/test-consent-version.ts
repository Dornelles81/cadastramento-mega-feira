/**
 * Teste do termo versionado (sem DB): render, gate de ativação e
 * server-authoritative stamp + checagem de corrida.
 */
import {
  renderConsent, buildConsentVars, isConsentVersionValid,
  resolveConsentStamp, ConsentVersionMismatch, CURRENT_CONSENT_VERSION,
} from '../lib/consent'

let failures = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) failures++
}

const ev = {
  name: 'Expofest 2026',
  startDate: '2026-08-15T00:00:00.000Z',
  endDate: '2026-08-20T00:00:00.000Z',
  venueName: 'Parque de Exposições',
  venueCity: 'Esteio',
  venueState: 'RS',
  organizerEmail: 'contato@expofest.com.br',
}

console.log('=== 1) gate de versão ===')
check('versão atual é válida', isConsentVersionValid(CURRENT_CONSENT_VERSION))
check('versão inexistente é inválida', !isConsentVersionValid('9.9'))
check('null é inválido (fluxo antigo)', !isConsentVersionValid(null))

console.log('\n=== 2) render injeta variáveis ===')
const vars = buildConsentVars(ev)
const term = renderConsent(CURRENT_CONSENT_VERSION, vars)
check('render retornou texto', !!term && term.length > 0)
check('injetou nome do evento', !!term && term.includes('Expofest 2026'))
check('injetou local (cidade/UF)', !!term && term.includes('Esteio/RS'))
check('data formatada em UTC (sem deslocar dia)', !!term && term.includes('15/08/2026') && term.includes('20/08/2026'))
check('DPO fixo no corpo (v1.0 não usa {{contato}})', !!term && term.includes('dornelles@megafeira.com'))
check('sem placeholders {{ }} remanescentes', !!term && !/\{\{.*\}\}/.test(term), term?.match(/\{\{.*\}\}/)?.[0])
check('render de versão inválida = null', renderConsent('9.9', vars) === null)

console.log('\n=== 3) stamp: evento SEM versão ativa (fluxo antigo) ===')
const noActive = resolveConsentStamp({ ...ev, eventConfigs: { consentTermVersion: null } }, undefined)
check('não carimba versão', noActive.consentTermVersion === null)
check('não carimba snapshot', noActive.consentText === null)

console.log('\n=== 4) stamp: evento COM versão ativa, cliente ecoa certo ===')
const active = { ...ev, eventConfigs: { consentTermVersion: CURRENT_CONSENT_VERSION } }
const ok = resolveConsentStamp(active, CURRENT_CONSENT_VERSION)
check('carimba a versão ativa', ok.consentTermVersion === CURRENT_CONSENT_VERSION)
check('snapshot é o texto renderizado (server-authoritative)', ok.consentText === term)

console.log('\n=== 5) corrida: cliente ecoa versão diferente/ausente → mismatch ===')
let threwOld = false
try { resolveConsentStamp(active, '0.9') } catch (e) { threwOld = e instanceof ConsentVersionMismatch }
check('versão velha (0.9) → ConsentVersionMismatch', threwOld)
let threwNone = false
try { resolveConsentStamp(active, undefined) } catch (e) { threwNone = e instanceof ConsentVersionMismatch }
check('sem eco (cliente velho) → ConsentVersionMismatch', threwNone)

console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS PASSARAM ✓' : failures + ' FALHA(S) ✗'} ===`)
process.exit(failures === 0 ? 0 : 1)
