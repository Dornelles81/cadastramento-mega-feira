/**
 * IDENTIDADE DO PARTICIPANTE — fonte única.
 *
 * A coluna `participants.cpf` guarda o documento que identifica a pessoa no
 * evento, e o índice `UNIQUE (eventId, cpf)` é o que garante "uma pessoa, um
 * cadastro". Para brasileiro isso é o CPF; para estrangeiro (Expofest tem casas
 * culturais e recebe convidados de fora) não há formato validável — cada país
 * tem o seu —, então o documento entra na MESMA coluna, com o tipo e o país
 * embutidos no valor.
 *
 * ── POR QUE O VALOR CARREGA O TIPO ───────────────────────────────────────────
 * Gravar o documento cru abriria uma classe de falha grave: um documento
 * estrangeiro com 11 dígitos colidiria com um CPF real. As duas consequências
 * são ruins e a segunda é séria — cadastro legítimo recusado como duplicado, e
 * a busca da PORTARIA devolvendo a pessoa errada, com nome e foto de outra.
 *
 * Como CPF é sempre exatamente 11 dígitos, qualquer valor com caractere
 * não-numérico é inequivocamente estrangeiro. A colisão entre os dois mundos
 * deixa de ser possível, e as linhas de CPF que já existem ficam byte a byte
 * iguais ao que sempre foram — nenhum backfill.
 *
 *   CPF         "00097680095"        (11 dígitos, como sempre)
 *   Passaporte  "PP-AR:AB1234567"
 *   DNI         "DNI-AR:12345678"
 *
 * ── UNICIDADE É POR TIPO + PAÍS + NÚMERO ────────────────────────────────────
 * "PP-AR:12345678" e "DNI-PY:12345678" são strings diferentes, então os dois
 * cadastros coexistem — que é o correto: são documentos diferentes, de pessoas
 * diferentes. DNI é numérico e sequencial na casa dos milhões, então colisão de
 * número entre Argentina, Paraguai e Uruguai é plausível, não teórica.
 *
 * ⚠️ E é justamente por isso que a busca da portaria por NÚMERO SOLTO pode casar
 * com mais de uma linha. Ver `montarBuscaPortaria`: quando isso acontecer, o
 * chamador NÃO pode escolher uma — tem que pedir o país. Escolher a primeira
 * seria reintroduzir a pessoa errada no portão pela porta dos fundos.
 */

// ── CPF ─────────────────────────────────────────────────────────────────────

/**
 * Validação de CPF (dígitos verificadores). ESTA é a única implementação.
 *
 * Existiam TRÊS cópias: utils/cpf-validator.ts (órfão, sem nenhum importador),
 * lib/participants/registrar.ts e pages/api/register-fixed.ts. Antes de
 * unificar, as três foram comparadas contra 616 entradas — CPFs válidos
 * gerados, aleatórios, dígitos repetidos, vazio, com máscara, alfanuméricos e
 * de comprimento errado: ZERO divergências. A consolidação preserva o
 * comportamento; as diferenças eram só chaves de bloco no for.
 */
export function isValidCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')

  if (numbers.length !== 11) return false
  if (/^(\d)\1{10}$/.test(numbers)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(numbers[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(numbers[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(numbers[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0

  return remainder === parseInt(numbers[10])
}

/** Máscara de exibição do CPF. Devolve a entrada intacta se não for CPF. */
export function formatCPF(cpf: string): string {
  const numbers = cpf.replace(/\D/g, '')
  if (numbers.length !== 11) return cpf
  return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// ── DOCUMENTO ESTRANGEIRO ───────────────────────────────────────────────────

/** Tipos aceitos. OUTRO existe para não travar quem chega com algo fora da lista. */
export const TIPOS_DOCUMENTO = ['PP', 'DNI', 'CI', 'OUTRO'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/** Separador entre o prefixo (tipo-país) e o número. NUNCA aparece num CPF. */
export const SEPARADOR_IDENTIDADE = ':'

/**
 * Normaliza o número informado: maiúsculas e só alfanumérico.
 *
 * Documento estrangeiro chega escrito de muitas formas — com espaço, ponto,
 * hífen, minúscula. Sem normalizar, a mesma pessoa se cadastraria duas vezes
 * ("ab 123.456" e "AB123456" seriam valores distintos) e a UNIQUE não veria
 * nada de errado.
 */
export function normalizarNumeroDocumento(numero: string): string {
  return (numero ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** Monta o valor que vai para a coluna de identidade. */
export function montarIdentidadeEstrangeira(entrada: {
  tipo: TipoDocumento
  pais: string
  numero: string
}): string {
  const pais = (entrada.pais ?? '').replace(/[^A-Za-z]/g, '').toUpperCase()
  const numero = normalizarNumeroDocumento(entrada.numero)
  return entrada.tipo + '-' + pais + SEPARADOR_IDENTIDADE + numero
}

export interface Identidade {
  /** false = CPF (11 dígitos); true = documento estrangeiro */
  estrangeiro: boolean
  tipo: TipoDocumento | 'CPF'
  /** ISO-3166 alpha-2; BR para CPF */
  pais: string
  /** O número sem o prefixo, já normalizado */
  numero: string
  /** O valor exatamente como está gravado na coluna */
  valor: string
}

/** Lê um valor gravado e devolve o que ele significa. Nunca lança. */
export function interpretarIdentidade(valor: string): Identidade {
  const bruto = valor ?? ''
  const i = bruto.indexOf(SEPARADOR_IDENTIDADE)
  if (i === -1) {
    // Sem separador: é o mundo antigo — CPF (ou legado malformado).
    return {
      estrangeiro: false,
      tipo: 'CPF',
      pais: 'BR',
      numero: bruto.replace(/\D/g, ''),
      valor: bruto
    }
  }
  const prefixo = bruto.slice(0, i)
  const numero = bruto.slice(i + 1)
  const partes = prefixo.split('-')
  const tipo = partes[0]
  return {
    estrangeiro: true,
    tipo: (TIPOS_DOCUMENTO as readonly string[]).includes(tipo) ? (tipo as TipoDocumento) : 'OUTRO',
    pais: partes[1] || '',
    numero,
    valor: bruto
  }
}

/** Rótulo curto para tela e exportação: "DNI AR" / "CPF". */
export function rotuloIdentidade(valor: string): string {
  const id = interpretarIdentidade(valor)
  return id.estrangeiro ? id.tipo + ' ' + id.pais : 'CPF'
}

// ── BUSCA DA PORTARIA ───────────────────────────────────────────────────────

export type BuscaPortaria =
  | { por: 'cpf'; where: { cpf: string } }
  | { por: 'idCurto'; where: { id: { startsWith: string } } }
  | { por: 'id'; where: { id: string } }

/**
 * Traduz o que o operador digitou no portão para um `where` do Prisma.
 *
 * ESTA é a única implementação. A mesma lógica estava copiada em
 * pages/api/access/fast-status.ts e pages/api/access/status/[id].ts, e as duas
 * cópias precisam mudar juntas quando o documento estrangeiro entrar — esquecer
 * uma significa a pessoa não ser encontrada NA HORA, parada na frente do
 * operador. O comportamento aqui é idêntico ao das duas cópias que substitui:
 *
 *   11 dígitos após limpeza -> CPF
 *   exatamente 8 caracteres -> prefixo do UUID (id curto)
 *   qualquer outra coisa    -> UUID completo
 *
 * ⚠️ AINDA NÃO ENCONTRA DOCUMENTO ESTRANGEIRO. O operador não sabe o prefixo
 * ("PP-AR:"), então digitar "AB1234567" cai no ramo do UUID e não acha — sem
 * erro, só "não encontrado", que no portão se lê como "não está cadastrada".
 * A quarta perna (buscar por sufixo SEPARADOR_IDENTIDADE + número normalizado)
 * entra JUNTO com o cadastro de estrangeiro, e precisa CONTAR os resultados:
 * número solto pode casar com dois países, e aí a resposta é pedir o país —
 * nunca escolher um.
 */
export function montarBuscaPortaria(entrada: string): BuscaPortaria {
  const soDigitos = entrada.replace(/\D/g, '')
  if (soDigitos.length === 11) return { por: 'cpf', where: { cpf: soDigitos } }
  if (entrada.length === 8) return { por: 'idCurto', where: { id: { startsWith: entrada.toLowerCase() } } }
  return { por: 'id', where: { id: entrada } }
}
