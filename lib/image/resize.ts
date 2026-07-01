/**
 * Utilitário de redimensionamento/compressão de imagem no cliente (browser).
 *
 * Usado por FileField e DocumentField para reduzir uploads de documento (foto de
 * celular full-res, 3-5 MB) ANTES de virarem base64 e entrarem no corpo do
 * cadastro. Sem isso, o POST estoura o limite de ~4,5 MB da plataforma (Vercel)
 * e retorna 413 (Payload Too Large) — vide o bug do cadastro via link de stand.
 *
 * Teto padrão: 1280px no maior lado, JPEG q0.7 — mantém RG/CNH legível e leva
 * uma foto típica para ~200-400 KB em base64.
 *
 * A captura FACIAL (EnhancedFaceCapture) NÃO usa este util de propósito: a régua
 * dela é ≤800px e está acoplada à medição interocular do detector (contrato do
 * gate). Mantida intocada para não regredir o fluxo facial já validado.
 */

export interface ResizeOptions {
  /** Maior lado em px (default 1280). */
  maxSize?: number
  /** Qualidade JPEG 0..1 (default 0.7). */
  quality?: number
}

const DEFAULTS: Required<ResizeOptions> = { maxSize: 1280, quality: 0.7 }

/** Dimensões preservando proporção, limitando o MAIOR lado a maxSize. */
function fitWithin(width: number, height: number, maxSize: number): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) return { width, height }
  if (width >= height) return { width: maxSize, height: Math.round((height / width) * maxSize) }
  return { width: Math.round((width / height) * maxSize), height: maxSize }
}

/** Desenha um source (img/video/canvas) num canvas reduzido e retorna JPEG dataURL. */
export function resizeDrawableToJpegDataUrl(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  opts: ResizeOptions = {}
): string {
  const { maxSize, quality } = { ...DEFAULTS, ...opts }
  const { width, height } = fitWithin(srcWidth, srcHeight, maxSize)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')
  ctx.drawImage(source, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Lê um File como dataURL (base64) sem alterar o conteúdo. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

/** True se o arquivo é uma imagem rasterizável (image/* exceto SVG vetorial). */
export function isResizableImage(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml'
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar imagem'))
    img.src = src
  })
}

/**
 * Comprime um File de IMAGEM para JPEG dataURL reduzido (≤maxSize, qualidade q).
 * Arquivos que NÃO são imagem rasterizável (PDF, SVG, etc.) são retornados como
 * dataURL bruto, sem alteração — não se tenta redimensionar um PDF.
 */
export async function compressImageFile(file: File, opts: ResizeOptions = {}): Promise<string> {
  if (!isResizableImage(file)) {
    return readFileAsDataUrl(file)
  }
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)
  return resizeDrawableToJpegDataUrl(img, img.naturalWidth || img.width, img.naturalHeight || img.height, opts)
}
