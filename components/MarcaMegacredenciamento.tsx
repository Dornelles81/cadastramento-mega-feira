import './marca-megacredenciamento.css'

/**
 * A marca do painel: "megacredenciamento", com a Mega Feira como detentora da
 * solucao em vez de assinatura principal.
 *
 * Substitui o <MegaFeiraLogo> nos cabecalhos de /admin. O MegaFeiraLogo NAO foi
 * alterado e continua em uso — ele ainda assina as telas que o PARTICIPANTE ve
 * (app/eventos/[slug], app/verificar/[id], components/stand/StandCadastroFlow),
 * onde a marca Mega Feira e a que a pessoa reconhece. Trocar o componente no
 * lugar teria mudado essas telas junto; por isso este e um componente novo.
 *
 * Tratamento tipografico igual ao das telas publicas e do login: a palavra
 * escrita junto, "mega" leve e estreito na cor secundaria, "credenciamento"
 * pesado e largo na principal. As cores sao as que o painel ja usava no
 * MEGA/FEIRA — verde-agua e azul-marinho —, entao nenhuma tela ganha cor nova.
 *
 * ⚠️ O estilo vive em marca-megacredenciamento.css, escopado em `.marca-mc`.
 * NAO envolva tela nenhuma de /admin na classe `.institucional`: o seletor
 * `body:has(.institucional)` daquela folha trocaria fundo e fonte do painel
 * inteiro.
 *
 * @param className  Tamanho e espacamento, via Tailwind — o CSS nao fixa
 *                   `font-size` justamente para o cabecalho continuar mandando
 *                   nisso. "megacredenciamento" tem 18 caracteres contra 9 de
 *                   "MEGA FEIRA", entao os cabecalhos passam text-base/md:text-lg
 *                   (e nao o text-2xl de antes) para a marca ocupar a mesma
 *                   largura de sempre e nao empurrar o titulo da tela.
 * @param darkMode   Mesma semantica do MegaFeiraLogo (true = tela escura), para
 *                   a troca nos cabecalhos ser mecanica.
 */
export default function MarcaMegacredenciamento({
  className = '',
  darkMode = true
}: {
  className?: string
  darkMode?: boolean
}) {
  return (
    <span className={`marca-mc ${darkMode ? 'marca-mc-escuro' : ''} ${className}`.trim()}>
      <i>mega</i>credenciamento
    </span>
  )
}

/**
 * A atribuicao da Mega Feira. Entra UMA VEZ no painel, no rodape do
 * /admin/dashboard.
 *
 * Por que so ali: nao existe app/admin/layout.tsx — cada tela repete o seu
 * proprio cabecalho —, entao colocar a linha junto ao logotipo significaria
 * repeti-la em seis cabecalhos de altura e empilhamento diferentes, que e
 * exatamente onde o risco de mexer na altura mora. No rodape do dashboard ela
 * aparece uma vez so, na tela em que toda sessao cai depois do login, sem
 * encostar em cabecalho nenhum.
 */
export function LinhaOperadora({
  className = '',
  darkMode = false
}: {
  className?: string
  darkMode?: boolean
}) {
  return (
    <p className={`marca-mc-operadora ${darkMode ? 'marca-mc-operadora-escuro' : ''} ${className}`.trim()}>
      Solução Mega Feira Tecnologia para Acessos
    </p>
  )
}
