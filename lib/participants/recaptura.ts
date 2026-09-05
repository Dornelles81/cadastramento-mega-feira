/**
 * POR QUE ESTA PESSOA PRECISA DE FOTO NOVA — fonte única.
 *
 * Existe porque "precisa recapturar" tem TRÊS origens independentes, e até
 * 04/09/2026 o aviso de recaptura enxergava só uma delas:
 *
 *   1. `sem-foto`        — não há foto nenhuma no cadastro
 *   2. `recusada-device` — o equipamento recebeu a foto e RECUSOU
 *   3. `riscoDeFace`     — a nossa validação viu risco (rosto não confirmado,
 *                          ou medido perto do piso)
 *
 * ── Por que as três, e por que nesta ordem ────────────────────────────────
 * A (3) é o nosso gate. A (2) é o veredito do equipamento — e o levantamento de
 * 04/09 mostrou que os dois discordam: das 4 fotos recusadas pelo terminal no
 * Expofest, TRÊS tinham passado no nosso gate (95, 106 e 130px de distância
 * interocular). Passar na nossa régua não garante que o device modela o rosto.
 * Selecionar só por `riscoDeFace` deixava essas três invisíveis para o aviso.
 *
 * A (1) entrou depois: sete pessoas ficaram ativas SEM foto porque foram
 * removidas e reativadas (a remoção apaga a biometria). Elas não têm risco
 * medido — não há foto para medir —, então também escapavam do aviso, e o
 * cadastro delas parecia perfeito na tela.
 *
 * A ordem de precedência é do mais concreto para o mais previsivo: não ter foto
 * é fato, o equipamento ter recusado é veredito, e o nosso risco é estimativa.
 * Quem está em mais de um caso recebe o motivo mais concreto — o gestor age
 * igual nos três (pedir foto nova), mas a frase precisa ser verdadeira.
 *
 * ⚠️ NÃO use `faceVersion` para decidir se alguém tem foto. Até 03/09 ele
 * sobrevivia à remoção que apagava `faceData`, e linhas antigas ainda estão
 * assim: o campo AFIRMA "tenho a foto versão X" sobre um registro sem foto
 * nenhuma. A fonte é `faceData` / `faceImageUrl`.
 */
import { riscoDeFace, type RiscoFace } from './face-risk'
import { deriveFaceStatus } from '../face/status'

export type MotivoRecaptura =
  | 'sem-foto'
  | 'recusada-device'
  | 'nao-validada'
  | 'medida-baixa'

/** Dados mínimos para classificar. `terminaisComFalha` conta linhas de sync `faceState='failed'`. */
export interface ParticipanteParaRecaptura {
  faceData?: unknown | null
  faceImageUrl?: string | null
  faceInterocularPx?: number | null
  customData?: unknown
  terminaisComFalha?: number
}

export function motivoDaRecaptura(p: ParticipanteParaRecaptura): MotivoRecaptura | null {
  // 1. FATO: não há foto.
  if (!p.faceData && !p.faceImageUrl) return 'sem-foto'

  // 2. VEREDITO do equipamento — vence a nossa estimativa, porque é o que
  //    decide se a catraca abre.
  if ((p.terminaisComFalha ?? 0) > 0) return 'recusada-device'

  // 3. ESTIMATIVA nossa.
  const risco: RiscoFace = riscoDeFace({
    faceInterocularPx: p.faceInterocularPx,
    faceStatus: deriveFaceStatus(p.faceInterocularPx),
    faceUnvalidated: !!(p.customData as any)?.__faceUnvalidated
  })
  if (risco === 'nao-validada') return 'nao-validada'
  if (risco === 'medida-baixa') return 'medida-baixa'
  return null
}

/**
 * A frase que vai para o RESPONSÁVEL DO STAND. Linguagem de quem vai PEDIR a
 * foto, não do gate: o gestor não sabe o que é distância interocular, e não
 * precisa saber para agir.
 */
export function frasePara(motivo: MotivoRecaptura): string {
  switch (motivo) {
    case 'sem-foto':
      return 'não há foto no cadastro'
    case 'recusada-device':
      return 'a foto não foi aceita pelo equipamento de acesso'
    case 'nao-validada':
      return 'o rosto não foi confirmado na foto'
    case 'medida-baixa':
      return 'o rosto ficou pequeno demais na foto'
  }
}

/** Rótulo curto para tela de admin, onde cabe o termo técnico. */
export function rotuloCurto(motivo: MotivoRecaptura): string {
  switch (motivo) {
    case 'sem-foto':
      return 'Sem foto'
    case 'recusada-device':
      return 'Recusada pelo terminal'
    case 'nao-validada':
      return 'Sem validação'
    case 'medida-baixa':
      return 'Rosto pequeno'
  }
}
