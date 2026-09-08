/**
 * PAÍSES — nome por extenso e código ISO 3166-1 alpha-2.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * A primeira versão do cadastro de estrangeiro pedia o país num campo de texto
 * livre limitado a 2 caracteres. Quem digitava o NOME do país acabava gravando
 * as duas primeiras letras dele, e o resultado é um código de país **válido e
 * errado**, sem nenhum sinal de que algo deu errado:
 *
 *   "Paraguay" -> PA = Panamá        (o certo é PY)
 *   "Chile"    -> CH = Suíça         (o certo é CL)
 *   "Bolivia"  -> BO = Bolívia       (certo POR ACASO)
 *   "Brasil"   -> BR = Brasil        (certo POR ACASO)
 *
 * Depois de gravado não há como distinguir acerto de acaso. E o estrago não é
 * cosmético: o país é METADE da chave de unicidade
 * (lib/participants/documento.ts). Um paraguaio gravado como PA e outro como PY
 * viram documentos de países diferentes — o mesmo número passa a caber duas
 * vezes, e a busca da portaria pede à pessoa um país que ela não reconhece.
 *
 * Por isso o país nunca é digitado: é escolhido pelo NOME, e o código ISO viaja
 * por trás. E o servidor confere o código contra esta lista — a requisição vem
 * do cliente e não merece confiança.
 */

export interface Pais {
  codigo: string
  nome: string
}

/**
 * Países mostrados no topo do seletor.
 *
 * Os três primeiros são os vizinhos de onde vêm os visitantes que chegam sem
 * passaporte, só com documento de identidade — o caso que motivou tudo isto.
 * Os demais são as casas culturais da Expofest, onde os convidados de fora
 * costumam estar vinculados.
 */
export const PAISES_DESTAQUE = [
  'AR', 'PY', 'UY',
  'DE', 'IT', 'AT', 'SE', 'NL', 'PL', 'CZ', 'FR', 'ES', 'PT', 'JP', 'LV'
] as const

/** Lista completa, ordenada por nome. */
export const PAISES: Pais[] = [
  { codigo: 'AF', nome: 'Afeganistão' },
  { codigo: 'ZA', nome: 'África do Sul' },
  { codigo: 'AL', nome: 'Albânia' },
  { codigo: 'DE', nome: 'Alemanha' },
  { codigo: 'AD', nome: 'Andorra' },
  { codigo: 'AO', nome: 'Angola' },
  { codigo: 'SA', nome: 'Arábia Saudita' },
  { codigo: 'DZ', nome: 'Argélia' },
  { codigo: 'AR', nome: 'Argentina' },
  { codigo: 'AM', nome: 'Armênia' },
  { codigo: 'AU', nome: 'Austrália' },
  { codigo: 'AT', nome: 'Áustria' },
  { codigo: 'AZ', nome: 'Azerbaijão' },
  { codigo: 'BS', nome: 'Bahamas' },
  { codigo: 'BD', nome: 'Bangladesh' },
  { codigo: 'BB', nome: 'Barbados' },
  { codigo: 'BH', nome: 'Bahrein' },
  { codigo: 'BE', nome: 'Bélgica' },
  { codigo: 'BZ', nome: 'Belize' },
  { codigo: 'BJ', nome: 'Benin' },
  { codigo: 'BY', nome: 'Bielorrússia' },
  { codigo: 'BO', nome: 'Bolívia' },
  { codigo: 'BA', nome: 'Bósnia e Herzegovina' },
  { codigo: 'BW', nome: 'Botsuana' },
  { codigo: 'BR', nome: 'Brasil' },
  { codigo: 'BN', nome: 'Brunei' },
  { codigo: 'BG', nome: 'Bulgária' },
  { codigo: 'BF', nome: 'Burkina Faso' },
  { codigo: 'BI', nome: 'Burundi' },
  { codigo: 'BT', nome: 'Butão' },
  { codigo: 'CV', nome: 'Cabo Verde' },
  { codigo: 'CM', nome: 'Camarões' },
  { codigo: 'KH', nome: 'Camboja' },
  { codigo: 'CA', nome: 'Canadá' },
  { codigo: 'QA', nome: 'Catar' },
  { codigo: 'KZ', nome: 'Cazaquistão' },
  { codigo: 'TD', nome: 'Chade' },
  { codigo: 'CL', nome: 'Chile' },
  { codigo: 'CN', nome: 'China' },
  { codigo: 'CY', nome: 'Chipre' },
  { codigo: 'SG', nome: 'Cingapura' },
  { codigo: 'CO', nome: 'Colômbia' },
  { codigo: 'CG', nome: 'Congo' },
  { codigo: 'CD', nome: 'Congo (República Democrática)' },
  { codigo: 'KP', nome: 'Coreia do Norte' },
  { codigo: 'KR', nome: 'Coreia do Sul' },
  { codigo: 'CI', nome: 'Costa do Marfim' },
  { codigo: 'CR', nome: 'Costa Rica' },
  { codigo: 'HR', nome: 'Croácia' },
  { codigo: 'CU', nome: 'Cuba' },
  { codigo: 'DK', nome: 'Dinamarca' },
  { codigo: 'DJ', nome: 'Djibuti' },
  { codigo: 'EG', nome: 'Egito' },
  { codigo: 'SV', nome: 'El Salvador' },
  { codigo: 'AE', nome: 'Emirados Árabes Unidos' },
  { codigo: 'EC', nome: 'Equador' },
  { codigo: 'ER', nome: 'Eritreia' },
  { codigo: 'SK', nome: 'Eslováquia' },
  { codigo: 'SI', nome: 'Eslovênia' },
  { codigo: 'ES', nome: 'Espanha' },
  { codigo: 'US', nome: 'Estados Unidos' },
  { codigo: 'EE', nome: 'Estônia' },
  { codigo: 'SZ', nome: 'Essuatíni' },
  { codigo: 'ET', nome: 'Etiópia' },
  { codigo: 'FJ', nome: 'Fiji' },
  { codigo: 'PH', nome: 'Filipinas' },
  { codigo: 'FI', nome: 'Finlândia' },
  { codigo: 'FR', nome: 'França' },
  { codigo: 'GA', nome: 'Gabão' },
  { codigo: 'GM', nome: 'Gâmbia' },
  { codigo: 'GH', nome: 'Gana' },
  { codigo: 'GE', nome: 'Geórgia' },
  { codigo: 'GR', nome: 'Grécia' },
  { codigo: 'GD', nome: 'Granada' },
  { codigo: 'GT', nome: 'Guatemala' },
  { codigo: 'GY', nome: 'Guiana' },
  { codigo: 'GF', nome: 'Guiana Francesa' },
  { codigo: 'GN', nome: 'Guiné' },
  { codigo: 'GQ', nome: 'Guiné Equatorial' },
  { codigo: 'GW', nome: 'Guiné-Bissau' },
  { codigo: 'HT', nome: 'Haiti' },
  { codigo: 'HN', nome: 'Honduras' },
  { codigo: 'HU', nome: 'Hungria' },
  { codigo: 'YE', nome: 'Iêmen' },
  { codigo: 'IN', nome: 'Índia' },
  { codigo: 'ID', nome: 'Indonésia' },
  { codigo: 'IQ', nome: 'Iraque' },
  { codigo: 'IR', nome: 'Irã' },
  { codigo: 'IE', nome: 'Irlanda' },
  { codigo: 'IS', nome: 'Islândia' },
  { codigo: 'IL', nome: 'Israel' },
  { codigo: 'IT', nome: 'Itália' },
  { codigo: 'JM', nome: 'Jamaica' },
  { codigo: 'JP', nome: 'Japão' },
  { codigo: 'JO', nome: 'Jordânia' },
  { codigo: 'KW', nome: 'Kuwait' },
  { codigo: 'LA', nome: 'Laos' },
  { codigo: 'LS', nome: 'Lesoto' },
  { codigo: 'LV', nome: 'Letônia' },
  { codigo: 'LB', nome: 'Líbano' },
  { codigo: 'LR', nome: 'Libéria' },
  { codigo: 'LY', nome: 'Líbia' },
  { codigo: 'LI', nome: 'Liechtenstein' },
  { codigo: 'LT', nome: 'Lituânia' },
  { codigo: 'LU', nome: 'Luxemburgo' },
  { codigo: 'MK', nome: 'Macedônia do Norte' },
  { codigo: 'MG', nome: 'Madagascar' },
  { codigo: 'MY', nome: 'Malásia' },
  { codigo: 'MW', nome: 'Malawi' },
  { codigo: 'MV', nome: 'Maldivas' },
  { codigo: 'ML', nome: 'Mali' },
  { codigo: 'MT', nome: 'Malta' },
  { codigo: 'MA', nome: 'Marrocos' },
  { codigo: 'MU', nome: 'Maurício' },
  { codigo: 'MR', nome: 'Mauritânia' },
  { codigo: 'MX', nome: 'México' },
  { codigo: 'MM', nome: 'Mianmar' },
  { codigo: 'MZ', nome: 'Moçambique' },
  { codigo: 'MD', nome: 'Moldávia' },
  { codigo: 'MC', nome: 'Mônaco' },
  { codigo: 'MN', nome: 'Mongólia' },
  { codigo: 'ME', nome: 'Montenegro' },
  { codigo: 'NA', nome: 'Namíbia' },
  { codigo: 'NP', nome: 'Nepal' },
  { codigo: 'NI', nome: 'Nicarágua' },
  { codigo: 'NE', nome: 'Níger' },
  { codigo: 'NG', nome: 'Nigéria' },
  { codigo: 'NO', nome: 'Noruega' },
  { codigo: 'NZ', nome: 'Nova Zelândia' },
  { codigo: 'OM', nome: 'Omã' },
  { codigo: 'NL', nome: 'Países Baixos (Holanda)' },
  { codigo: 'PW', nome: 'Palau' },
  { codigo: 'PS', nome: 'Palestina' },
  { codigo: 'PA', nome: 'Panamá' },
  { codigo: 'PG', nome: 'Papua-Nova Guiné' },
  { codigo: 'PK', nome: 'Paquistão' },
  { codigo: 'PY', nome: 'Paraguai' },
  { codigo: 'PE', nome: 'Peru' },
  { codigo: 'PL', nome: 'Polônia' },
  { codigo: 'PR', nome: 'Porto Rico' },
  { codigo: 'PT', nome: 'Portugal' },
  { codigo: 'KE', nome: 'Quênia' },
  { codigo: 'KG', nome: 'Quirguistão' },
  { codigo: 'GB', nome: 'Reino Unido' },
  { codigo: 'CF', nome: 'República Centro-Africana' },
  { codigo: 'DO', nome: 'República Dominicana' },
  { codigo: 'CZ', nome: 'República Tcheca' },
  { codigo: 'RO', nome: 'Romênia' },
  { codigo: 'RW', nome: 'Ruanda' },
  { codigo: 'RU', nome: 'Rússia' },
  { codigo: 'SN', nome: 'Senegal' },
  { codigo: 'SL', nome: 'Serra Leoa' },
  { codigo: 'RS', nome: 'Sérvia' },
  { codigo: 'SY', nome: 'Síria' },
  { codigo: 'SO', nome: 'Somália' },
  { codigo: 'LK', nome: 'Sri Lanka' },
  { codigo: 'SD', nome: 'Sudão' },
  { codigo: 'SS', nome: 'Sudão do Sul' },
  { codigo: 'SE', nome: 'Suécia' },
  { codigo: 'CH', nome: 'Suíça' },
  { codigo: 'SR', nome: 'Suriname' },
  { codigo: 'TH', nome: 'Tailândia' },
  { codigo: 'TW', nome: 'Taiwan' },
  { codigo: 'TJ', nome: 'Tajiquistão' },
  { codigo: 'TZ', nome: 'Tanzânia' },
  { codigo: 'TL', nome: 'Timor-Leste' },
  { codigo: 'TG', nome: 'Togo' },
  { codigo: 'TT', nome: 'Trinidad e Tobago' },
  { codigo: 'TN', nome: 'Tunísia' },
  { codigo: 'TM', nome: 'Turcomenistão' },
  { codigo: 'TR', nome: 'Turquia' },
  { codigo: 'UA', nome: 'Ucrânia' },
  { codigo: 'UG', nome: 'Uganda' },
  { codigo: 'UY', nome: 'Uruguai' },
  { codigo: 'UZ', nome: 'Uzbequistão' },
  { codigo: 'VU', nome: 'Vanuatu' },
  { codigo: 'VA', nome: 'Vaticano' },
  { codigo: 'VE', nome: 'Venezuela' },
  { codigo: 'VN', nome: 'Vietnã' },
  { codigo: 'ZM', nome: 'Zâmbia' },
  { codigo: 'ZW', nome: 'Zimbábue' }
]

const PORCODIGO = new Map(PAISES.map((p) => [p.codigo, p]))

/** O código é um país conhecido? Usado pelo SERVIDOR — o cliente não decide isso. */
export function ehCodigoPaisValido(codigo: string): boolean {
  return PORCODIGO.has(String(codigo ?? '').toUpperCase())
}

/** Nome por extenso. Devolve o próprio código quando não conhecido (legado). */
export function nomeDoPais(codigo: string): string {
  const c = String(codigo ?? '').toUpperCase()
  const p = PORCODIGO.get(c)
  return p ? p.nome : c
}

/** Os destaques, na ordem em que devem aparecer no topo do seletor. */
export function paisesDestaque(): Pais[] {
  return PAISES_DESTAQUE.map((c) => PORCODIGO.get(c)).filter(Boolean) as Pais[]
}

/** Todos os demais, já ordenados por nome. */
export function paisesRestantes(): Pais[] {
  const destaque = new Set<string>(PAISES_DESTAQUE as readonly string[])
  return PAISES.filter((p) => !destaque.has(p.codigo))
}
