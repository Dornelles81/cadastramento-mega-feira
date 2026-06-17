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

export function isEligible(
  p: EligibilityParticipant,
  opts: { requiresApproval: boolean }
): boolean {
  if (p.status !== 'active') return false
  if (p.isDeleted) return false
  if (getFaceImageDataUrl(p) === null) return false
  if (opts.requiresApproval && p.approvalStatus !== 'approved') return false
  return true
}
