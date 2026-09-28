/**
 * Troca da foto de quem JÁ está cadastrado — UM caminho só.
 *
 * Dois chamadores, com gatilhos diferentes e a mesma gravação:
 *   - /api/participants/update  (link de edição, a própria pessoa)
 *   - /api/balcao/[token]/trocar-foto  (balcão de recoleta da feira)
 *
 * Existe como módulo porque cada regra abaixo já foi, em algum momento, a que
 * faltou num dos caminhos: a barreira de tamanho do FDLib, a métrica de
 * detecção que tem de ser APAGADA quando a foto nova vem sem medição, e as duas
 * chamadas de fan-out. Duas cópias disso divergem na primeira correção.
 *
 * O que este módulo NÃO faz, de propósito: mexer em `approvalStatus`. Trocar a
 * foto mantém a aprovação (decisão de 2026-09-28 para o balcão, que é também o
 * comportamento de sempre do link de edição). A conferência de identidade é
 * responsabilidade de quem chama.
 */
import { encryptString } from '../crypto'
import { faceVersionOf } from '../face/version'
import { checkFaceSize, FACE_TOO_LARGE_MESSAGE } from '../face/size-limit'
import { faceMetricsForPrisma } from '../face/metrics'
import { enqueueFaceChange, onBecameEligible } from '../agent/sync-enqueue'

export type FotoPreparada =
  | { ok: true; data: Record<string, unknown>; faceVersion: string }
  | { ok: false; status: 413; body: { error: string; message: string; bytes: number; limit: number } }

/** Normaliza o data URL e recusa foto maior que o limite do terminal. */
export function prepararFotoNova(faceImage: string, faceData: any): FotoPreparada {
  const faceDataUrl = faceImage.includes(',') ? faceImage : `data:image/jpeg;base64,${faceImage}`
  // BARREIRA DE TAMANHO — ver lib/face/size-limit. Uma recaptura grande demais
  // substituiria uma foto que funciona por uma que o terminal recusa, e o
  // `faceVersion` novo ainda mandaria o agente apagar e recriar o usuário.
  const tamanho = checkFaceSize(faceDataUrl)
  if (!tamanho.ok) {
    return {
      ok: false,
      status: 413,
      body: { error: 'Face image too large', message: FACE_TOO_LARGE_MESSAGE, bytes: tamanho.bytes, limit: tamanho.limite }
    }
  }
  const faceVersion = faceVersionOf(faceDataUrl) // F5: nova versão
  return {
    ok: true,
    faceVersion,
    data: {
      faceData: encryptString(faceDataUrl),
      faceImageUrl: null,
      faceVersion,
      ...(faceData && typeof faceData.faceInterocularPx === 'number'
        ? { faceInterocularPx: faceData.faceInterocularPx }
        : {}),
      // Métricas do detector descrevem ESTA captura. Sobrescreve inclusive com
      // null: foto nova sem medição (captureAnyway) tem de APAGAR as métricas da
      // anterior, senão a antiga fica valendo para a imagem nova.
      ...faceMetricsForPrisma(faceData)
    }
  }
}

/**
 * Leva a foto nova aos terminais. Chame DEPOIS de gravar.
 *
 * As DUAS chamadas, nesta ordem, porque cobrem casos diferentes:
 *
 *   onBecameEligible  → PRIMEIRA foto. Quem foi aprovado ANTES de ter foto
 *     não tinha `employeeNo` (a identidade só é atribuída a quem é elegível, e
 *     sem face ninguém é) nem linha de sync utilizável. É aqui que a identidade
 *     é atribuída e o fan-out acontece. Sem isto, a pessoa ficava ativa,
 *     aprovada, com biometria — e invisível nos terminais, sem erro nenhum.
 *
 *   enqueueFaceChange → TROCA de foto de quem já estava sincronizado. Devolve
 *     face e card a `pending` nas linhas existentes, com contador e backoff
 *     zerados. Não cria linha, então não substitui a de cima.
 *
 * Não é preciso checar elegibilidade aqui: `onBecameEligible` não atribui
 * identidade a inelegível, e `enqueueForContext` recusa por conta própria.
 * Falha de fan-out não desfaz a gravação: a reconciliação recupera.
 */
export async function propagarFotoNova(eventId: string | null, participantId: string): Promise<void> {
  try {
    await onBecameEligible(eventId, participantId)
  } catch (e) {
    console.error('onBecameEligible falhou:', e)
  }
  try {
    await enqueueFaceChange(participantId)
  } catch (e) {
    console.error('enqueueFaceChange falhou:', e)
  }
}
