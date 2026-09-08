import { prisma } from '../prisma'
import { tryGetFaceImageDataUrl } from '../face-image'
import { deriveFaceStatus, isValidFace } from '../face/status'
import { decryptDocuments } from '../documents'
import { buscarRemocoes, montarRemocao } from './removal-badge'

/**
 * O formato do participante para as telas do admin — UM lugar só.
 *
 * Existia apenas dentro de pages/api/admin/participants-full.ts, que alimenta a
 * listagem. O PUT de edição devolvia a linha CRUA do Prisma, num formato
 * diferente: sem `standName`, `eventName`, `faceStatus`, `temFoto`, `sync` nem
 * `removal` — e, pior, COM `faceData`, a biometria cifrada, que não tem por que
 * trafegar numa resposta de edição.
 *
 * A diferença não era acadêmica. A tela de evento atualizava a linha na lista
 * com a CÓPIA LOCAL do formulário depois de salvar, e essa cópia não carrega
 * `standName`. O filtro por stand lê exatamente esse campo
 * (`participant.standName || 'Sem stand'`), então quem editasse um participante
 * com um stand selecionado no dropdown via o cadastro SUMIR da tela — intacto no
 * banco, ausente da lista até um F5. Foi o que aconteceu em 07/09/2026.
 *
 * Com o mesmo formato dos dois lados, a tela funde a resposta do SERVIDOR e
 * passa a exibir o que foi realmente gravado — não o que foi enviado.
 */

/** `select` do participante para as telas do admin. */
export const ADMIN_PARTICIPANT_SELECT = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  phone: true,
  eventCode: true,
  eventId: true,
  createdAt: true,
  // Estado de exclusão: alimenta o badge "Excluído pelo gestor" e é o que
  // explica ao admin por que aquele CPF continua bloqueado para recadastro
  status: true,
  removedAt: true,
  removedBy: true,
  consentAccepted: true,
  faceInterocularPx: true,
  faceImageUrl: true, // Foto legada (data URL em claro)
  faceData: true, // Foto nova (AES-256-GCM) — decriptada server-side, nunca enviada crua
  // Estado REAL nos terminais. Sem isto a coluna "Status da face" mostra só a
  // nossa validação e mente.
  terminalSyncs: {
    select: { faceState: true, removalState: true, faceVersion: true }
  },
  faceVersion: true,
  customData: true,
  documents: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
  rejectionReason: true,
  standId: true,
  stand: {
    select: {
      code: true,
      name: true
    }
  },
  event: {
    select: {
      id: true,
      name: true,
      code: true,
      slug: true
    }
  }
} as const

/**
 * Converte a linha selecionada com `ADMIN_PARTICIPANT_SELECT` no objeto que as
 * telas do admin consomem.
 *
 * @param exclusoes  Mapa vindo de `buscarRemocoes` (o ator da exclusão). Só é
 *                   consultado para `status === 'removed'`.
 * @param origem     Identificador para o log de biometria corrompida.
 */
export function formatAdminParticipant(
  participant: any,
  exclusoes: Awaited<ReturnType<typeof buscarRemocoes>>,
  origem: string
) {
  // Removido pelo gestor: a exclusão já apagou biometria/documentos no banco
  // (SENSITIVE_PARTICIPANT_CLEAR). Zerar de novo aqui é cinto e suspensório —
  // linha antiga ou falha parcial na limpeza não vira foto exposta no painel.
  const removido = participant.status === 'removed'
  return {
    id: participant.id,
    name: participant.name,
    cpf: participant.cpf,
    email: participant.email || '',
    phone: participant.phone || '',
    eventCode: participant.eventCode || 'MEGA-FEIRA-2025',
    eventId: participant.eventId,
    eventName: participant.event?.name || '',
    eventSlug: participant.event?.slug || '',
    createdAt: participant.createdAt.toISOString(),
    consentAccepted: participant.consentAccepted,
    faceInterocularPx: participant.faceInterocularPx,
    faceStatus: deriveFaceStatus(participant.faceInterocularPx),
    hasValidFace: isValidFace(participant.faceInterocularPx),
    // [assim-mesmo] Captura sem validação (detector morto) — distingue de legado
    // (null sem a chave). Conferência operacional: badge + filtro + coluna no export.
    faceUnvalidated: !!(participant.customData as any)?.__faceUnvalidated,
    // ── ESTADO REAL DA FOTO ────────────────────────────────────────────────
    // `temFoto` vem de faceData/faceImageUrl, NUNCA de faceVersion: até 03/09 o
    // faceVersion sobrevivia à remoção que apagava a foto, e linhas antigas
    // ainda estão assim.
    temFoto: !!(participant.faceData || participant.faceImageUrl),
    // Contagem por estado, só das linhas em push (`removalState: 'none'`).
    sync: (() => {
      const emPush = participant.terminalSyncs.filter((t: any) => t.removalState === 'none')
      return {
        total: emPush.length,
        // `synced` de verdade: além do estado, a versão da face no device tem
        // que bater com a do cadastro. Igual ao que o reconcile compara.
        sincronizadas: emPush.filter(
          (t: any) => t.faceState === 'synced' && !!t.faceVersion && t.faceVersion === participant.faceVersion
        ).length,
        desatualizadas: emPush.filter(
          (t: any) => t.faceState === 'synced' && (!t.faceVersion || t.faceVersion !== participant.faceVersion)
        ).length,
        falhas: emPush.filter((t: any) => t.faceState === 'failed').length,
        pendentes: emPush.filter((t: any) => t.faceState === 'pending').length
      }
    })(),
    // Tolerante: uma biometria corrompida vira card sem foto, não 500 na
    // listagem inteira. A falha sai no log com o participantId.
    faceImageUrl: removido
      ? ''
      : tryGetFaceImageDataUrl(participant, { participantId: participant.id, where: origem }) || '',
    customData: removido ? {} : participant.customData || {},
    documents: removido ? {} : decryptDocuments(participant.documents) || {}, // decifra server-side p/ o modal
    approvalStatus: participant.approvalStatus || 'pending',
    approvedAt: participant.approvedAt?.toISOString() || null,
    approvedBy: participant.approvedBy || null,
    rejectionReason: participant.rejectionReason || null,
    standCode: participant.stand?.code || null,
    standName: participant.stand?.name || null,
    // Estado de exclusão para o badge. `removal` só existe para removidos; o
    // ator vem do audit log, com removedAt/removedBy de fallback (legado).
    status: participant.status,
    removal: removido ? montarRemocao(participant, exclusoes) : null
  }
}

/**
 * Lê UM participante já no formato das telas do admin. Usado pelo PUT de edição
 * para devolver o registro como a listagem o representa.
 */
export async function lerParticipanteParaAdmin(id: string, origem: string) {
  const participant = await prisma.participant.findUnique({
    where: { id },
    select: ADMIN_PARTICIPANT_SELECT
  })
  if (!participant) return null
  const exclusoes = await buscarRemocoes(participant.status === 'removed' ? [participant.id] : [])
  return formatAdminParticipant(participant, exclusoes, origem)
}
