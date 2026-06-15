/**
 * Elegibilidade de acesso aos terminais e derivação do employeeNo.
 *
 * Regra (device-integration-plan):
 *   status='active' AND isDeleted=false AND face utilizável
 *   AND (quando Event.requiresApprovalForAccess) approvalStatus='approved'.
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

/**
 * Identificador do usuário no terminal (ISAPI employeeNo).
 *
 * FASE 1: o esquema definitivo (sequencial vs derivado do credentialNumber) é
 * decidido junto com o valor do card e o teste de bancada. Por ora usamos o
 * credentialNumber (numérico, dedicado, sem dado pessoal) e caímos para um
 * prefixo do id quando ausente. Determinístico e estável por participante.
 */
export function deriveEmployeeNo(p: { credentialNumber?: string | null; id: string }): string {
  if (p.credentialNumber && /^\d+$/.test(p.credentialNumber)) {
    return p.credentialNumber
  }
  return p.id.replace(/\D/g, '').slice(0, 8) || p.id.slice(0, 8)
}
