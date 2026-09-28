/**
 * Elegibilidade de acesso aos terminais.
 *
 * Regra (device-integration-plan):
 *   status='active' AND isDeleted=false AND face utilizável
 *   AND (quando Event.requiresApprovalForAccess) approvalStatus='approved'.
 *
 * O identificador no terminal é o `Participant.employeeNo` (Fase 1: sequencial
 * global via `assignIdentityIfEligible`). O antigo `deriveEmployeeNo` (derivado
 * do credentialNumber/id) foi APOSENTADO na Fase 2 — o /work usa `employeeNo`.
 */
import { getFaceImageDataUrl } from '../face-image'

export interface EligibilityParticipant {
  status: string | null
  isDeleted: boolean
  approvalStatus: string | null
  faceData?: Buffer | Uint8Array | null
  faceImageUrl?: string | null
}

/**
 * A regra, UMA vez. A foto entra como função para manter a ordem das
 * checagens: status e exclusão decidem antes, e a foto (que em `isEligible`
 * decripta e pode lançar) só é olhada quando ainda importa.
 */
function regra(
  p: Pick<EligibilityParticipant, 'status' | 'isDeleted' | 'approvalStatus'>,
  temFoto: () => boolean,
  opts: { requiresApproval: boolean }
): boolean {
  if (p.status !== 'active') return false
  if (p.isDeleted) return false
  if (!temFoto()) return false
  if (opts.requiresApproval && p.approvalStatus !== 'approved') return false
  return true
}

/** Decide a foto DECRIPTANDO. Lança `FaceDecryptionError` se ela não abrir. */
export function isEligible(
  p: EligibilityParticipant,
  opts: { requiresApproval: boolean }
): boolean {
  return regra(p, () => getFaceImageDataUrl(p) !== null, opts)
}

/**
 * Mesma regra, com a presença da foto já decidida por quem chama — em geral
 * por `lib/face/presence`, no banco, sem trazer os bytes. Para varreduras do
 * evento inteiro (reconciliação), onde decriptar cada foto só para responder
 * "existe?" custava 135 MB por chamada. Não detecta foto ilegível: ver o
 * cabeçalho de `lib/face/presence`.
 */
export function isEligiblePorPresenca(
  p: Pick<EligibilityParticipant, 'status' | 'isDeleted' | 'approvalStatus'>,
  temFoto: boolean,
  opts: { requiresApproval: boolean }
): boolean {
  return regra(p, () => temFoto, opts)
}
