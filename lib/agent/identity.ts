/**
 * Atribuição de identidade do participante para os terminais (Fase 1).
 *
 * Dois números numéricos, dedicados, nunca derivados de dado pessoal:
 *  - employeeNo: id do usuário no terminal (chave de addUser/uploadFace/
 *    registerCard/deleteUser). Sequencial global (sequence dedicada), 8 dígitos
 *    padronizados, IMUTÁVEL — uma vez atribuído, nunca muda nem volta a null.
 *  - cardNumber: credencial do card/QR. Aleatório de 16 dígitos com dígito
 *    Luhn, único globalmente.
 *
 * A atribuição acontece quando o participante fica ELEGÍVEL (active + não
 * deletado + face utilizável + aprovação quando o evento exige). É idempotente:
 * campos já preenchidos nunca são sobrescritos.
 */
import { randomInt } from 'crypto'
import { prisma } from '../prisma'
import { isEligible } from './eligibility'

const CARD_LENGTH = 16 // 15 aleatórios + 1 dígito Luhn
const EMP_PAD = 8

// --- Luhn ---
export function luhnCheckDigit(payload: string): number {
  let sum = 0
  let double = true // o dígito de verificação fica à direita; o último do payload é dobrado
  for (let i = payload.length - 1; i >= 0; i--) {
    let d = payload.charCodeAt(i) - 48
    if (double) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

export function luhnValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false
  let sum = 0
  let double = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48
    if (double) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/** Gera um cardNumber de 16 dígitos (15 aleatórios + Luhn). */
export function generateCardNumber(): string {
  let payload = ''
  for (let i = 0; i < CARD_LENGTH - 1; i++) payload += randomInt(0, 10).toString()
  return payload + luhnCheckDigit(payload).toString()
}

/** Próximo employeeNo da sequence global, padronizado em 8 dígitos. */
async function nextEmployeeNo(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ v: bigint }[]>(
    "SELECT nextval('participant_employee_no_seq') as v"
  )
  return rows[0].v.toString().padStart(EMP_PAD, '0')
}

export interface AssignResult {
  assigned: boolean
  employeeNo: string | null
  cardNumber: string | null
  reason?: string
}

/**
 * Atribui employeeNo e/ou cardNumber a um participante SE ele for elegível e
 * ainda não os tiver. Imutável: nunca sobrescreve valores existentes. Garante
 * unicidade do cardNumber (unique + retry em colisão). Não lança por colisão.
 */
export async function assignIdentityIfEligible(participantId: string): Promise<AssignResult> {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, status: true, isDeleted: true, approvalStatus: true,
      faceData: true, faceImageUrl: true, employeeNo: true, cardNumber: true,
      event: { select: { requiresApprovalForAccess: true } }
    }
  })
  if (!p) return { assigned: false, employeeNo: null, cardNumber: null, reason: 'not found' }

  const requiresApproval = p.event?.requiresApprovalForAccess ?? true
  if (!isEligible(p, { requiresApproval })) {
    return { assigned: false, employeeNo: p.employeeNo, cardNumber: p.cardNumber, reason: 'not eligible' }
  }

  // Nada a fazer se ambos já estão setados (imutável).
  if (p.employeeNo && p.cardNumber) {
    return { assigned: false, employeeNo: p.employeeNo, cardNumber: p.cardNumber, reason: 'already assigned' }
  }

  // employeeNo: consome a sequence UMA vez (só se faltar).
  const employeeNo = p.employeeNo ?? (await nextEmployeeNo())

  // cardNumber: gera com retry em colisão de unicidade.
  let lastErr: any = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const cardNumber = p.cardNumber ?? generateCardNumber()
    try {
      const updated = await prisma.participant.update({
        where: { id: participantId },
        data: {
          ...(p.employeeNo ? {} : { employeeNo }),
          ...(p.cardNumber ? {} : { cardNumber })
        },
        select: { employeeNo: true, cardNumber: true }
      })
      return { assigned: true, employeeNo: updated.employeeNo, cardNumber: updated.cardNumber }
    } catch (e: any) {
      // P2002 = violação de unique. Se for no cardNumber, regenera e tenta de novo.
      if (e?.code === 'P2002' && !p.cardNumber) { lastErr = e; continue }
      throw e
    }
  }
  return { assigned: false, employeeNo, cardNumber: null, reason: 'card collision retries esgotadas: ' + (lastErr?.message ?? '') }
}
