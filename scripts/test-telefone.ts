/**
 * TELEFONE — regra única de formato (lib/participants/telefone.ts).
 *
 * O caso que motivou tudo é o par de baixo: "celular sem DDD" era recusado e
 * "celular com um dígito faltando" era ACEITO, pelo mesmo número 10 — porque a
 * regra antiga contava caracteres da máscara em vez de dígitos. Em produção
 * sobraram 13 celulares incompletos contra 1 fixo real nessa faixa.
 *
 * Não toca no banco: são funções puras. Uso:
 *   npx tsx scripts/test-telefone.ts
 */
import {
  digitosDoTelefone,
  validarTelefone,
  formatarTelefone
} from '../lib/participants/telefone'

let falhas = 0
function check(label: string, cond: boolean, extra?: any) {
  console.log(`${cond ? '✓' : '✗ FALHOU'}  ${label}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`)
  if (!cond) falhas++
}

function aceita(label: string, entrada: string, digitosEsperados: string) {
  const r = validarTelefone(entrada)
  check(
    `aceita ${label}: ${JSON.stringify(entrada)}`,
    r.ok && r.digitos === digitosEsperados,
    r.ok ? r.digitos : r.mensagem
  )
}

function recusa(label: string, entrada: string, trechoDaMensagem: string) {
  const r = validarTelefone(entrada)
  check(
    `recusa ${label}: ${JSON.stringify(entrada)}`,
    !r.ok && r.mensagem.toLowerCase().includes(trechoDaMensagem.toLowerCase()),
    r.ok ? 'ACEITOU' : r.mensagem
  )
}

console.log('\n── ACEITA ───────────────────────────────────────────────────')
aceita('celular com DDD', '(55) 99988-7766', '55999887766')
aceita('celular sem máscara', '55999887766', '55999887766')
aceita('fixo com DDD', '(55) 3333-4444', '5533334444')
aceita('fixo sem máscara', '5533334444', '5533334444')
aceita('com +55 do país', '+55 55 99988-7766', '55999887766')
aceita('com 0 de operadora', '055999887766', '55999887766')
aceita('DDD 11', '11987654321', '11987654321')

console.log('\n── RECUSA ───────────────────────────────────────────────────')
recusa('celular SEM DDD', '999887766', 'incompleto')
recusa('fixo SEM DDD', '33334444', 'incompleto')
recusa('vazio', '', 'DDD')
recusa('celular com um dígito faltando', '5599988776', 'faltar um dígito')
recusa('11 dígitos sem o 9 do celular', '55333344445', 'começa com 9')
recusa('dígitos demais', '559998877661', 'demais')
recusa('DDD com zero', '5099988776', 'DDD inválido')

console.log('\n── O CASO DA REGRA ANTIGA ───────────────────────────────────')
// Os dois têm 10 caracteres e 10 dígitos: min(10) tratava igual.
const celularQuebrado = validarTelefone('5599988776')
const fixoDeVerdade = validarTelefone('5533334444')
check('celular incompleto agora é recusado', !celularQuebrado.ok)
check('fixo de verdade continua aceito', fixoDeVerdade.ok)

console.log('\n── MÁSCARA ──────────────────────────────────────────────────')
check('celular formata', formatarTelefone('55999887766') === '(55) 99988-7766', formatarTelefone('55999887766'))
check('fixo formata (antes ficava cru)', formatarTelefone('5533334444') === '(55) 3333-4444', formatarTelefone('5533334444'))
check('parcial enquanto digita', formatarTelefone('5599') === '(55) 99', formatarTelefone('5599'))
check('parcial de fixo', formatarTelefone('55333') === '(55) 333', formatarTelefone('55333'))
check('+55 colado normaliza', digitosDoTelefone(formatarTelefone('5599988776699')).length === 11, formatarTelefone('5599988776699'))
// Truncar em 13 fabricava um número válido a partir de lixo colado.
check('lixo longo não vira número válido', !validarTelefone(formatarTelefone('55999887766999')).ok, formatarTelefone('55999887766999'))
check('acima de 11 dígitos sai sem máscara', formatarTelefone('559998877669') === '559998877669', formatarTelefone('559998877669'))
check('reformatar não corrompe', formatarTelefone(formatarTelefone('55999887766')) === '(55) 99988-7766')
check('vazio continua vazio', formatarTelefone('') === '')

console.log(falhas === 0 ? '\n✅ tudo certo\n' : `\n❌ ${falhas} falha(s)\n`)
process.exit(falhas === 0 ? 0 : 1)
