/**
 * Render de exemplo do termo v1.0 com valores do Expofest + verificação de
 * que nenhum placeholder sobrou. Não toca o DB.
 */
import { renderConsent, buildConsentVars, CURRENT_CONSENT_VERSION } from '../lib/consent'

const expofest = {
  name: 'Expofest 2026',
  startDate: '2026-08-28T00:00:00.000Z',
  endDate: '2026-09-06T00:00:00.000Z',
  venueName: 'Parque de Exposições Assis Brasil',
  venueCity: 'Esteio',
  venueState: 'RS',
  venueAddress: null,
  organizerEmail: 'contato@expofest.com.br',
}

// Valores variáveis do Expofest (defaults do sistema, exceto o que o evento ajustar)
const vars = buildConsentVars(expofest, {
  retentionDays: 90,
  camposColetados: 'nome, CPF, e-mail e telefone',
  finalidadesAdicionais: '', // só entrada
  meioAlternativo: 'crachá com QR code, retirado na secretaria do evento',
})

const term = renderConsent(CURRENT_CONSENT_VERSION, vars)!

console.log('================= TERMO RENDERIZADO (v' + CURRENT_CONSENT_VERSION + ') =================\n')
console.log(term)
console.log('\n================= VERIFICAÇÕES =================')
const leftover = term.match(/\{\{[^}]*\}\}/g)
console.log(leftover ? '✗ SOBROU placeholder: ' + JSON.stringify(leftover) : '✓ nenhum placeholder {{ }} remanescente')
console.log(/\*\*/.test(term) ? '✗ sobrou markdown **' : '✓ sem markdown ** (renderiza limpo)')
console.log(term.includes('\n\n\n') ? '✗ linha em branco dupla (finalidade vazia)' : '✓ sem parágrafo em branco solto')
process.exit(leftover ? 1 : 0)
