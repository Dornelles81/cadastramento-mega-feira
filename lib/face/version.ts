/**
 * Versão (hash) do CONTEÚDO da face — F5. Calculada sobre a imagem EM CLARO
 * (data URL) ANTES de cifrar: o `faceData` cifrado usa IV/GCM aleatório, então
 * hashear o cifrado mudaria a cada gravação mesmo com a MESMA foto. O hash do
 * conteúdo em claro é estável p/ a mesma captura e muda na re-captura — é o que
 * a reconciliação compara p/ detectar "face trocada".
 */
import { createHash } from 'crypto'

export function faceVersionOf(faceDataUrl: string): string {
  return createHash('sha256').update(faceDataUrl).digest('hex')
}
