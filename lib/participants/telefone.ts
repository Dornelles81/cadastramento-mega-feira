/**
 * TELEFONE DO PARTICIPANTE — fonte única.
 *
 * O telefone é o único canal direto com quem já se cadastrou. Quando é preciso
 * refazer a coleta facial, sem ele só resta falar com o gestor do stand e pedir
 * que ele encontre a pessoa. Por isso o campo é obrigatório no Expofest desde
 * 03/09/2026 — e por isso vale validar direito.
 *
 * ── O QUE ESTE ARQUIVO CORRIGE ──────────────────────────────────────────────
 * A regra anterior vivia em duas cópias de `Joi.string().min(10)` (stand e
 * página pública), SÓ no servidor, e media CARACTERES da string recebida — não
 * dígitos. Como o cliente manda o valor já mascarado, a regra media coisas
 * diferentes conforme o caso:
 *
 *   (55) 99988-7766   → 15 caracteres, 11 dígitos   → passava
 *   5533334444        → 10 caracteres, 10 dígitos   → passava no limite exato
 *   5599988776        → 10 caracteres, 10 dígitos   → PASSAVA, e é um celular
 *                                                     com um dígito faltando
 *   999887766         →  9 caracteres,  9 dígitos   → recusado (celular sem DDD)
 *
 * O mesmo número "10" que deixava entrar celular quebrado barrava quem só tinha
 * esquecido o DDD — e o erro só aparecia DEPOIS da foto, em inglês, sem dizer
 * qual campo. Em produção sobraram 13 celulares com um dígito a menos contra 1
 * fixo de verdade entre os telefones de 10 dígitos: a fronteira estava aceitando
 * justamente o que deveria barrar.
 *
 * Aqui a contagem é de DÍGITOS e a estrutura do número é verificada:
 *   - 11 dígitos: DDD + 9 + 8 dígitos  (celular)
 *   - 10 dígitos: DDD + 2..5 + 7 dígitos (fixo)
 * O primeiro dígito depois do DDD é o que separa os dois casos, e é ele que
 * denuncia o celular incompleto.
 *
 * As mensagens são em português e dizem o que fazer, porque VÃO APARECER para o
 * participante — tanto no formulário quanto no alert de erro do servidor, que
 * não tem contexto de campo nenhum.
 */

/** Mensagem padrão: campo vazio, ou número curto demais para dizer mais. */
export const MENSAGEM_TELEFONE = 'Informe o telefone com DDD (ex.: (55) 99999-9999)'

/**
 * Um número brasileiro bem formado: DDD + celular (9 + 8 dígitos) ou DDD + fixo
 * (2..5 + 7 dígitos). É o mesmo teste que a validação faz — aqui sem mensagem,
 * só para decidir se uma sobra de dígitos é ou não um telefone.
 */
function temFormaDeTelefone(d: string): boolean {
  if (d[1] === '0') return false // nenhum DDD tem zero
  if (d.length === 11) return d[2] === '9'
  if (d.length === 10) return '2345'.includes(d[2])
  return false
}

/**
 * Só os dígitos do número, já sem os prefixos de discagem.
 *
 * Nenhum DDD brasileiro começa com zero, então zero à esquerda é sempre ruído
 * de discagem (0xx de operadora, 00 internacional) e sai sem conversa.
 *
 * O 55 do país é ambíguo e exige mais cuidado: "55" + fixo de 10 dígitos e um
 * celular com um dígito sobrando têm os MESMOS 12 dígitos, e o DDD 55 é o de
 * Ijuí — ou seja, metade do Expofest. Por isso o código do país só sai quando o
 * que sobra é um telefone bem formado; do contrário os 12 dígitos seguem
 * inteiros e a validação reclama de "dígitos demais", que é o que de fato
 * aconteceu. Sem essa checagem, `559998877661` (erro de digitação) virava
 * `9998877661` e recebia a mensagem errada, sobre dígito faltando.
 */
export function digitosDoTelefone(valor?: string | null): string {
  let d = String(valor ?? '').replace(/\D/g, '')
  while (d.startsWith('0')) d = d.slice(1)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    const semPais = d.slice(2)
    if (temFormaDeTelefone(semPais)) d = semPais
  }
  return d
}

export type ResultadoTelefone =
  | { ok: true; digitos: string }
  | { ok: false; mensagem: string }

/**
 * Valida um telefone PREENCHIDO. Vazio é decisão de quem chama: no formulário,
 * "obrigatório" vem da configuração do campo por evento (`_system_phone`), e no
 * servidor o telefone segue opcional — há eventos com o campo desligado, e 480
 * cadastros do Expofest anteriores a 03/09 que nasceram sem telefone nenhum.
 */
export function validarTelefone(valor?: string | null): ResultadoTelefone {
  const d = digitosDoTelefone(valor)

  if (!d) return { ok: false, mensagem: MENSAGEM_TELEFONE }
  if (d.length < 10) {
    return { ok: false, mensagem: `Telefone incompleto. ${MENSAGEM_TELEFONE}` }
  }
  if (d.length > 11) {
    return {
      ok: false,
      mensagem: 'Telefone com dígitos demais. Informe DDD + número (10 ou 11 dígitos).'
    }
  }
  if (d[1] === '0') {
    return { ok: false, mensagem: 'DDD inválido. Informe os dois dígitos do DDD (ex.: 55).' }
  }

  const primeiroDoNumero = d[2]
  if (d.length === 11 && primeiroDoNumero !== '9') {
    return {
      ok: false,
      mensagem:
        'Número inválido: celular começa com 9 depois do DDD. ' +
        'Telefone fixo tem 8 dígitos depois do DDD.'
    }
  }
  if (d.length === 10 && !'2345'.includes(primeiroDoNumero)) {
    // O caso que a regra antiga deixava passar: celular com um dígito a menos.
    return {
      ok: false,
      mensagem: 'Parece faltar um dígito: celular tem 9 dígitos depois do DDD (ex.: (55) 99999-9999).'
    }
  }

  return { ok: true, digitos: d }
}

/** `null` quando está tudo bem (ou quando veio vazio); a mensagem quando não. */
export function erroDeTelefoneOpcional(valor?: string | null): string | null {
  if (!digitosDoTelefone(valor)) return null
  const r = validarTelefone(valor)
  return r.ok ? null : r.mensagem
}

/**
 * Máscara para exibição e digitação, progressiva.
 *
 * Formata OS DOIS formatos. A máscara anterior era `(\d{2})(\d{5})(\d{4})`, que
 * só casa com 11 dígitos — telefone fixo ficava cru na tela, sem parênteses nem
 * traço, parecendo campo quebrado enquanto o celular do colega ao lado
 * formatava. O primeiro dígito depois do DDD decide o tamanho do primeiro
 * bloco, e ele já vale enquanto a pessoa digita.
 *
 * O teto é 13 dígitos, não 11, por causa de quem digita o +55 à mão: o código do
 * país só é reconhecível quando o número fecha em 12 ou 13 dígitos, e um corte
 * em 11 decapitaria o final antes disso — "+55 51 99988-7766" digitado tecla a
 * tecla virava "(55) 5199-98877", um número plausível e errado. Colado de uma
 * vez sempre funcionou; agora digitado também chega certo.
 *
 * Acima de 11 dígitos o número sai CRU, sem máscara: formatar o que ainda não é
 * um telefone válido seria dar aparência de certo ao que a validação vai
 * recusar. E não há truncamento — cortar era pior do que não cortar: colar 14
 * dígitos de lixo começando em 55 sobrava exatamente 13, o código do país saía
 * junto e o campo FABRICAVA um telefone válido que ninguém digitou. Sem corte, o
 * excesso fica visível e a validação recusa, dos dois lados.
 */
export function formatarTelefone(valor?: string | null): string {
  const d = digitosDoTelefone(valor)
  if (d.length <= 2 || d.length > 11) return d

  const bloco = d[2] === '9' ? 5 : 4
  const inicio = d.slice(2, 2 + bloco)
  const fim = d.slice(2 + bloco)
  return `(${d.slice(0, 2)}) ${inicio}${fim ? '-' + fim : ''}`
}
