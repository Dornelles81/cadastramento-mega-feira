/**
 * Risco da FOTO para o reconhecimento no terminal — fonte única para a UI.
 *
 * Distingue dois riscos que não podem ser tratados igual:
 *
 *   'nao-validada'  — NINGUÉM mediu rosto nenhum nesta foto. Ou a captura caiu
 *      no `captureAnyway` (detector fora do ar, gate inteiramente ignorado), ou
 *      o detector rodou e não achou rosto. É o caso da foto de parede que
 *      chegou à fila de aprovação em 2026-08-31.
 *
 *   'medida-baixa'  — rosto medido, dentro do gate, mas perto do piso. O
 *      terminal aceita e extrai template; o reconhecimento ao vivo é que fica
 *      incerto.
 *
 * ── Por que a distinção importa ────────────────────────────────────────────
 * Ela decide o ATRITO. 'nao-validada' pede confirmação explícita ao aprovar,
 * porque aprovar manda a foto para todos os terminais e ela vira credencial de
 * acesso. 'medida-baixa' recebe aviso visual e mais nada: exigir confirmação em
 * ~16% dos cadastros seria atrito diário, o operador aprenderia a clicar sem
 * ler, e aí a confirmação que importa também seria ignorada.
 *
 * Legado (`unmeasured` SEM a flag) NÃO é marcado, mantendo a semântica que o
 * resto do código já usa: não medido não é o mesmo que inválido.
 */
import { MIN_INTEROCULAR_PX } from '../face/status'

/**
 * Abaixo disto, a medição é "de atenção". Não é o piso do gate (60) — é a
 * faixa ACIMA do piso em que o rosto passou raspando. Levantamento de
 * 2026-08-31: mediana da base = 116px, p10 = 88px; abaixo de 80 está no
 * décimo inferior, e é onde apareceu o caso de rosto cortado que passou por
 * ter 75px.
 */
export const ATENCAO_INTEROCULAR_PX = 80

export type RiscoFace = 'nao-validada' | 'medida-baixa' | null

export interface ParticipanteComFace {
  faceInterocularPx?: number | null
  faceStatus?: 'unmeasured' | 'no_face' | 'too_small' | 'valid'
  faceUnvalidated?: boolean
}

export function riscoDeFace(p: ParticipanteComFace): RiscoFace {
  // Gate ignorado na captura, ou detector rodou e não viu rosto.
  if (p.faceUnvalidated === true) return 'nao-validada'
  if (p.faceStatus === 'no_face') return 'nao-validada'

  // Abaixo do piso o gate deveria ter barrado; se chegou aqui, é caso a olhar.
  if (p.faceStatus === 'too_small') return 'medida-baixa'

  const px = p.faceInterocularPx
  if (typeof px === 'number' && px > 0 && px < ATENCAO_INTEROCULAR_PX) {
    return 'medida-baixa'
  }
  return null
}

/** Texto do `title` — explica o risco em uma frase, sem jargão. */
export function tituloRiscoDeFace(p: ParticipanteComFace): string {
  const r = riscoDeFace(p)
  if (r === 'nao-validada') {
    return p.faceStatus === 'no_face'
      ? 'O detector rodou e NÃO encontrou rosto nesta foto. Confira antes de aprovar.'
      : 'Foto capturada sem validação automática: ninguém verificou se há um rosto. Confira antes de aprovar.'
  }
  if (r === 'medida-baixa') {
    const px = p.faceInterocularPx
    return `Rosto medido em ${px}px, perto do piso de ${MIN_INTEROCULAR_PX}px. ` +
      'O terminal aceita, mas o reconhecimento ao vivo pode falhar.'
  }
  return ''
}
