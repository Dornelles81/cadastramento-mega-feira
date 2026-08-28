/**
 * Régua de texto das etiquetas — UMA instância de jsPDF em memória, compartilhada.
 *
 * O auto-fit das etiquetas (tamanho de fonte e quebra de linha) precisa medir com o MESMO
 * instrumento nos dois lados: o gerador do PDF e a prévia da tela. Medir a prévia pelo layout
 * do navegador (Arial) e o PDF pela tabela Helvetica do jsPDF dá divergência nos casos que
 * ficam no limite — a prévia escolhe uma fonte ou um nº de linhas e o papel sai com outro.
 *
 * Por isso aqui: um jsPDF em memória, nas mesmas condições do gerador real (unit 'mm',
 * helvetica bold), memoizado — nunca um por render. Ele não desenha nada, só mede.
 *
 * As medidas saem em MILÍMETROS (unit do documento); o tamanho da fonte é em pt, como sempre
 * no jsPDF. `size` é explícito em toda chamada: não existe estado de fonte para esquecer de
 * ajustar antes de medir.
 */

export type Medidor = {
  /** Largura do texto em mm, na fonte do tamanho dado (pt). */
  largura(texto: string, size: number): number
  /** Quebra o texto em linhas que caibam em `areaW` mm, na fonte do tamanho dado (pt). */
  quebrar(texto: string, size: number, areaW: number): string[]
}

// A família/estilo têm que ser os mesmos que o gerador usa ao desenhar.
const FAMILIA = 'helvetica'
const ESTILO = 'bold'

let promessa: Promise<Medidor> | null = null
let pronto: Medidor | null = null

/**
 * Instância já carregada, ou null. Serve para o primeiro render não piscar quando o módulo
 * do jsPDF já veio numa montagem anterior.
 */
export function medidorCarregado(): Medidor | null {
  return pronto
}

/**
 * Carrega (uma vez) o jsPDF e devolve o medidor. O import é dinâmico para o jsPDF continuar
 * fora do bundle inicial da página.
 */
export function carregarMedidor(): Promise<Medidor> {
  if (!promessa) {
    promessa = import('jspdf').then(({ jsPDF }) => {
      // format é irrelevante para medir; o que importa é unit 'mm' — getTextWidth e
      // splitTextToSize devolvem/aceitam valores na unidade do documento.
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [60, 40] })
      const medidor: Medidor = {
        largura(texto, size) {
          doc.setFont(FAMILIA, ESTILO)
          doc.setFontSize(size)
          return doc.getTextWidth(texto)
        },
        quebrar(texto, size, areaW) {
          doc.setFont(FAMILIA, ESTILO)
          doc.setFontSize(size)
          return doc.splitTextToSize(texto, areaW)
        }
      }
      pronto = medidor
      return medidor
    })
  }
  return promessa
}
