/**
 * Miniatura da foto facial para LISTAGENS do painel.
 *
 * A lista de participantes mostrava cada rosto num círculo de 40 px usando a
 * foto em tamanho cheio: ~80 KB por pessoa, ~180 MB para abrir a tela do
 * Expofest (e 135 MB lidos do Neon). Aqui a foto vira um WebP de 96×96 — o
 * dobro do círculo, para telas de densidade 2x —, gerado na hora.
 *
 * NÃO é armazenada. Uma coluna de miniatura seria biometria nova, e cada
 * caminho que hoje apaga a foto (remoção, expurgo LGPD, reativação, recaptura,
 * SENSITIVE_PARTICIPANT_CLEAR, varredura do audit_logs) teria que apagá-la
 * também; um esquecimento é um rosto que sobrevive à exclusão. Decisão de
 * 2026-09-28: gerar sob demanda até depois do evento.
 */
import sharp from 'sharp'

export const MINIATURA_PX = 96
const QUALIDADE = 60

/**
 * Recebe o data URL da foto (já decriptado) e devolve a miniatura como data
 * URL WebP. Devolve null para o que não é imagem embutida — URL http legada
 * não é baixada daqui (o servidor não sai buscando imagem de terceiros).
 */
export async function miniaturaDeDataUrl(dataUrl: string): Promise<string | null> {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const entrada = Buffer.from(m[1], 'base64')
  const saida = await sharp(entrada, { failOn: 'none' })
    .rotate() // respeita a orientação EXIF da câmera do celular
    .resize(MINIATURA_PX, MINIATURA_PX, { fit: 'cover', position: 'attention' })
    .webp({ quality: QUALIDADE })
    .toBuffer()
  return `data:image/webp;base64,${saida.toString('base64')}`
}
