/**
 * NÚCLEO DO CADASTRO DE CREDENCIADO — um lugar só, dois chamadores.
 *
 * Extraído de `pages/api/stand-registration.ts` em 04/09/2026, SEM mudança de
 * comportamento. O motivo da extração é o balcão: ele cadastra pela sessão do
 * operador em vez do token do stand, e duplicar este miolo faria a reserva de
 * vaga, o limite de tamanho da foto, o carimbo do termo e o fan-out divergirem
 * entre os dois caminhos em poucas semanas. É exatamente como o `handleUpdate`
 * e o `handleDelete` de `participants/[id].ts` divergiram por um ano: a correção
 * da biometria no audit log foi aplicada num e esquecida no outro.
 *
 * ── O QUE ESTA FUNÇÃO NÃO FAZ ─────────────────────────────────────────────
 * Autorização. Ela recebe um `standId` e um `eventId` JÁ AUTORIZADOS pelo
 * chamador — via token validado (link do stand) ou via sessão + permissão
 * (balcão). Nunca derive `standId` de nada que o cliente enviou sem verificar
 * antes; o núcleo confia no contexto que recebe.
 *
 * ── FORMATO DA RECUSA ─────────────────────────────────────────────────────
 * As recusas devolvem `{ status, body }` com o MESMO código e o MESMO corpo
 * JSON que o endpoint enviava antes, para que os dois chamadores respondam
 * igual e a mudança seja invisível para o cliente. O `StandFullError` continua
 * sendo LANÇADO (não devolvido) porque o mapeamento dele para HTTP já vivia no
 * `catch` do endpoint, e mexer nisso mudaria comportamento.
 *
 * ── O QUE FOI VALIDADO EM PRODUÇÃO (04/09/2026) ───────────────────────────
 * Cadastro real pelo link público, feito pelo responsável do projeto.
 *
 * PROVADO:
 *   - cifragem da foto (AES-256-GCM) e cálculo do `faceVersion`
 *   - carimbo de consentimento com IP e data
 *   - reserva de vaga e atualização da contagem do stand
 *   - cadastro completo (201), CPF repetido (409 de duplicidade) e stand
 *     lotado (409), nesta ordem de checagem
 *
 * NÃO PROVADO — não confundir com "validado":
 *   - a ENTREGA ao equipamento. No evento de teste a alocação vigente
 *     apontava só para um terminal fora de contato, então a face ficou em
 *     `pending`. Fica para o teste do balcão, que precisa dessa ponta de
 *     qualquer forma.
 *   - o `onBecameEligible` DESTE arquivo. Ele só roda em evento SEM
 *     `requiresApprovalForAccess`; o evento de teste exige aprovação, e nesse
 *     caminho quem dispara o fan-out é `lib/participants/approval.ts`, que a
 *     extração não tocou. Continua sem teste.
 */
import { prisma } from '../prisma'
import { encryptString } from '../crypto'
import { faceVersionOf } from '../face/version'
import { checkFaceSize, FACE_TOO_LARGE_MESSAGE } from '../face/size-limit'
import { faceMetricsForPrisma } from '../face/metrics'
import { respostaCpfDuplicado } from './cpf-duplicado'
import { occupiedSlotsWhere } from '../stand-access/occupancy'
import { onBecameEligible, enqueueFaceChange } from '../agent/sync-enqueue'
import { resolveConsentStamp, ConsentVersionMismatch } from '../consent'
import { encryptDocuments } from '../documents'

/** Campos que o participante preenche. Já validados pelo schema do chamador. */
export interface EntradaDoCadastro {
  name: string
  cpf: string
  email?: string | null
  phone?: string | null
  faceImage?: string | null
  faceData?: any
  consent: boolean
  consentTermVersion?: string | null
  customData?: Record<string, any>
}

/** O que o chamador já autorizou e resolveu. */
export interface ContextoDoCadastro {
  /** Stand de destino — JÁ AUTORIZADO pelo chamador. */
  standId: string
  /** Teto de vagas do stand, usado na recontagem autoritativa. */
  standMaxRegistrations: number
  /** Evento do stand. */
  eventId: string | null
  /** IP de quem aceitou o termo (LGPD) e user-agent do aparelho. */
  ip: string
  userAgent: string
}

export type RecusaDoCadastro = { status: number; body: Record<string, unknown> }

export type ResultadoDoCadastro =
  | { ok: true; participant: { id: string; name: string; createdAt: Date } }
  | { ok: false; recusa: RecusaDoCadastro }

export class StandFullError extends Error {
  // nextRelease ≠ null indica que há slot(s) travado(s) pela regra
  // anti-rotatividade (Fase 7) liberando na próxima virada
  constructor(public nextRelease: Date | null) {
    super('Stand lotado')
  }
}

export function isValidCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')
  if (numbers.length !== 11) return false
  if (/^(\d)\1{10}$/.test(numbers)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(numbers[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(numbers[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(numbers[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  return remainder === parseInt(numbers[10])
}


/** Normaliza nome para comparar: sem acento, sem caixa, sem espaço duplo. */
function nomeNormalizado(n: string): string {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function registrarCredenciado(
  entrada: EntradaDoCadastro,
  contexto: ContextoDoCadastro
): Promise<ResultadoDoCadastro> {
  const { name, cpf, email, phone, faceImage, faceData, consent, consentTermVersion, customData } = entrada
  const { standId, standMaxRegistrations, ip, userAgent } = contexto

  const event = contexto.eventId
    ? await prisma.event.findUnique({
        where: { id: contexto.eventId },
        include: { eventConfigs: true }
      })
    : null
  if (!event) {
    return { ok: false, recusa: { status: 400, body: {
      error: 'Event not found',
      message: 'Evento do stand não encontrado. Contate a organização.'
    } } }
  }

  const requireFace = event.eventConfigs?.requireFace !== false
  if (requireFace && !faceImage) {
    return { ok: false, recusa: { status: 400, body: {
      error: 'Validation failed',
      message: 'Foto facial é obrigatória para este evento'
    } } }
  }

  const cleanCPF = cpf.replace(/\D/g, '')
  if (!isValidCPF(cleanCPF)) {
    return { ok: false, recusa: { status: 400, body: { error: 'Invalid CPF', message: 'CPF inválido' } } }
  }

  // ── DUPLICIDADE: só cadastro ATIVO bloqueia ───────────────────────────────
  // Até 04/09/2026 esta checagem olhava qualquer linha do CPF no evento, sem
  // filtrar status — então uma linha `removed` bloqueava o recadastro para
  // sempre, com a mensagem de "já possui cadastro". No Expofest isso prendeu 9
  // pessoas em duas semanas: o gestor removia (quase sempre para corrigir stand
  // errado), a pessoa tentava de novo e batia num 409 que ninguém conseguia
  // destravar — nem ela, nem o gestor, nem o balcão.
  //
  // ⚠️ REGRA EM DOIS LUGARES, COM COMPORTAMENTO DELIBERADAMENTE DIFERENTE.
  // O gêmeo é pages/api/register-fixed.ts (cadastro público sem stand):
  //
  //   AQUI (link do stand)  : linha removida → REVIVE, a pessoa se recadastra
  //   register-fixed.ts     : linha removida → 409 orientando a usar o link do
  //                           stand. NÃO revive.
  //
  // A divergência é escolha, não esquecimento: aquele fluxo aceita cadastro SEM
  // stand e valida limite por contagem, enquanto aqui a revivência depende da
  // reserva atômica de vaga num stand. Dar revivência a ele exigiria um caminho
  // de escrita novo, sem stand, que ninguém exercita — havia 1 participante sem
  // stand no banco inteiro e nenhum no Expofest em 04/09/2026.
  //
  // MUDOU AQUI, MUDA LÁ — e reavalie se a divergência ainda se justifica. Está
  // anotado nos DOIS arquivos porque é o padrão handleUpdate/handleDelete de
  // participants/[id].ts, que divergiu por um ano justamente por omissão.
  const existente = await prisma.participant.findFirst({
    where: { cpf: cleanCPF, eventId: event.id },
    select: {
      id: true, name: true, email: true, phone: true, status: true, isDeleted: true,
      standId: true, createdAt: true, slotLockedUntil: true,
      approvalStatus: true, approvedAt: true, approvedBy: true,
      consentDate: true, consentTermVersion: true, faceVersion: true
    }
  })

  // `isDeleted` é expurgo LGPD: NÃO revive. Reviver religaria a pessoa ao
  // histórico (audit, acessos, aprovações) que o expurgo existiu para cortar.
  // Custo assumido: o CPF segue bloqueado nesse caso. Zero ocorrências no banco
  // em 04/09/2026 — se algum dia acontecer, é decisão nova, não silêncio.
  const revivivel = !!existente && existente.status === 'removed' && !existente.isDeleted

  if (existente && !revivivel) {
    return { ok: false, recusa: { status: 409, body: { ...respostaCpfDuplicado() } } }
  }

  // Vaga travada pela regra anti-rotatividade (Fase 7) vale para a revivência
  // igual: quem usou a credencial hoje não libera a vaga até a virada, mesmo
  // sendo a própria pessoa voltando.
  if (existente && revivivel && existente.slotLockedUntil && existente.slotLockedUntil > new Date()) {
    throw new StandFullError(existente.slotLockedUntil)
  }

  // Biometria: criptografa a imagem (AES-256-GCM) — nunca armazenar plaintext
  let encryptedFaceData: Buffer | null = null
  let faceVersion: string | null = null // F5: hash do conteúdo da face
  // Medição REAL do detector (MediaPipe); null se o cliente não mediu (legado).
  const faceInterocularPx =
    faceData && typeof faceData.faceInterocularPx === 'number'
      ? faceData.faceInterocularPx
      : null
  if (faceImage) {
    const dataUrl = faceImage.includes(',')
      ? faceImage
      : `data:image/jpeg;base64,${faceImage}`
    // BARREIRA DE TAMANHO (o cliente já recomprime em degraus; isto é a
    // segunda camada, para cliente antigo em cache, requisição fora do app
    // ou compressão que não coube). Foto grande demais é aceita pelo cadastro
    // e RECUSADA pelo terminal dias depois — falhar aqui, na cara de quem
    // pode tirar outra foto, é o único momento barato.
    const tamanho = checkFaceSize(dataUrl)
    if (!tamanho.ok) {
      return { ok: false, recusa: { status: 413, body: {
        error: 'Face image too large',
        message: FACE_TOO_LARGE_MESSAGE,
        bytes: tamanho.bytes,
        limit: tamanho.limite
      } } }
    }
    encryptedFaceData = encryptString(dataUrl)
    faceVersion = faceVersionOf(dataUrl)
  }

  const { documents, ...otherCustomData } = customData || {}

  // [assim-mesmo] Captura sem validação (câmera do sistema com MediaPipe morto):
  // faceInterocularPx vem null (sentinela honesto) e faceData.faceDetected === false.
  // Marca no customData p/ conferência operacional (distingue de legado, que é null SEM
  // esta chave). Ver painel/export "Sem validação".
  if (faceData && faceData.faceDetected === false) {
    otherCustomData.__faceUnvalidated = true
  }

  const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '90', 10)
  const retentionDate = new Date(event.endDate)
  retentionDate.setDate(retentionDate.getDate() + retentionDays)

  // Termo versionado: server-authoritative (carimba versão + snapshot; corrida → 409).
  // Evento sem versão ativa → stamp vazio (fluxo antigo intacto).
  let consentStamp
  try {
    consentStamp = resolveConsentStamp(event, consentTermVersion, { retentionDays })
  } catch (e) {
    if (e instanceof ConsentVersionMismatch) {
      return { ok: false, recusa: { status: 409, body: {
        error: 'Consent term updated',
        message: 'O termo de consentimento foi atualizado. Recarregue a página para ler e aceitar a nova versão.',
        currentVersion: e.expected
      } } }
    }
    throw e
  }

  // Dados do participante — montados uma vez; usados na reserva rápida ou no
  // caminho autoritativo (cache "cheio").
  const participantData = {
    name: name.trim(),
    cpf: cleanCPF,
    email: email || null,
    phone: phone ? phone.replace(/\D/g, '') : '',
    eventId: event.id,
    eventCode: event.code,
    standId,
    faceImageUrl: null,
    faceData: encryptedFaceData,
    faceInterocularPx,
    ...faceMetricsForPrisma(faceData),
    faceVersion,
    consentAccepted: consent,
    consentIp: ip,
    consentDate: new Date(),
    consentText: consentStamp.consentText, // snapshot do termo aceito (null = fluxo antigo)
    consentTermVersion: consentStamp.consentTermVersion, // versão aceita (null = fluxo antigo)
    retentionDate,
    deviceInfo: userAgent,
    documents: encryptDocuments(documents || {}), // cifrado em repouso (AES-256-GCM)
    customData: otherCustomData || {}
  }

  // ── Reserva de vaga (caminho quente) ───────────────────────────────
  // UPDATE condicional atômico: o lock de linha dura APENAS o UPDATE, não uma
  // transação interativa. Cadastros simultâneos serializam por microssegundos no
  // servidor em vez de segurar conexão do pool esperando `FOR UPDATE` — era isso
  // que esgotava o pool e derrubava 34/50 com P2028 (ver scripts/loadtest).
  // O Postgres reavalia `currentCount < maxRegistrations` contra o valor
  // recém-commitado, então a reserva NUNCA fura o limite (limite rígido).
  const reserved = await prisma.$executeRaw`
      UPDATE stands
      SET "currentCount" = "currentCount" + 1
      WHERE id = ${standId} AND "currentCount" < "maxRegistrations"
    `

  // ── GRAVAÇÃO: cria, ou REVIVE a linha removida ────────────────────────────
  // Reviver é UPDATE na mesma linha, e não INSERT novo, por duas razões: o
  // índice UNIQUE (eventId, cpf) recusaria o INSERT de qualquer forma, e manter
  // o mesmo `id` preserva a auditoria inteira da pessoa — cadastrou, foi
  // removida, voltou — em vez de espalhá-la por duas linhas sem ligação.
  //
  // O que a revivência ZERA, e por quê:
  //   approvalStatus/approvedAt/approvedBy/rejectionReason → é cadastro novo na
  //     prática; ninguém aprovou ESTE. Sem isso, quem foi removido estando
  //     aprovado voltaria aprovado, com foto nova que ninguém conferiu.
  //   status/removedAt/removedBy/slotLockedUntil/pendingDeviceRemoval → a
  //     remoção deixou de valer.
  //   checkedIn/checkedInAt/checkedInBy → "está dentro do evento" é estado do
  //     cadastro anterior; herdar diria que a pessoa entrou hoje.
  // NÃO zera `employeeNo`: é sequencial global e nunca reutilizado (Fase 1).
  const resetDaRevivencia = {
    status: 'active',
    removedAt: null,
    removedBy: null,
    slotLockedUntil: null,
    pendingDeviceRemoval: false,
    approvalStatus: 'pending',
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
    checkedIn: false,
    checkedInAt: null,
    checkedInBy: null
  }

  const gravar = async () => {
    if (!existente) {
      return prisma.participant.create({ data: participantData })
    }
    const [revivido] = await prisma.$transaction([
      prisma.participant.update({
        where: { id: existente.id },
        data: { ...participantData, ...resetDaRevivencia }
      }),
      // O token de edição da linha ANTIGA continuaria válido apontando para o
      // cadastro novo — quem o tivesse editaria os dados de outra pessoa.
      prisma.participantEditToken.updateMany({
        where: { participantId: existente.id, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      prisma.auditLog.create({
        data: {
          eventId: event.id,
          standId,
          action: 'PARTICIPANT_RE_REGISTERED',
          entityType: 'participant',
          entityId: existente.id,
          targetParticipantId: existente.id,
          actorType: 'participant',
          ip,
          userAgent,
          // Sem biometria e sem documento: o mesmo recorte do resto da auditoria.
          previousData: {
            name: existente.name, email: existente.email, phone: existente.phone,
            standId: existente.standId, status: existente.status,
            approvalStatus: existente.approvalStatus,
            approvedAt: existente.approvedAt ? existente.approvedAt.toISOString() : null,
            approvedBy: existente.approvedBy,
            consentDate: existente.consentDate ? existente.consentDate.toISOString() : null,
            consentTermVersion: existente.consentTermVersion,
            tinhaFoto: !!existente.faceVersion,
            registeredAt: existente.createdAt.toISOString()
          },
          newData: {
            name: participantData.name, email: participantData.email,
            phone: participantData.phone, standId,
            status: 'active', approvalStatus: 'pending',
            consentDate: participantData.consentDate.toISOString(),
            consentTermVersion: participantData.consentTermVersion,
            tinhaFoto: !!faceVersion
          },
          // NÃO bloqueia — marca para ser encontrável depois. Se o CPF tiver sido
          // digitado errado no cadastro antigo, a linha era de OUTRA pessoa e o
          // histórico dela passa a acompanhar quem cadastrou agora. Bloquear por
          // divergência devolveria a pessoa ao beco que esta correção fecha, e
          // nome diverge por motivo legítimo (apelido, nome de casada, grafia).
          changes: {
            nomeDivergente: nomeNormalizado(existente.name) !== nomeNormalizado(participantData.name)
          },
          description:
            'Recadastro por cima de linha removida. Antes: ' + existente.name + '. Agora: ' + participantData.name + '.',
          severity: 'INFO'
        }
      })
    ])
    return revivido
  }

  let participant
  if (reserved === 1) {
    // Vaga reservada. Grava FORA de qualquer lock; se a gravação falhar,
    // devolve a vaga (compensação) para a vaga não vazar.
    try {
      participant = await gravar()
    } catch (createErr) {
      await prisma.$executeRaw`
          UPDATE stands SET "currentCount" = "currentCount" - 1
          WHERE id = ${standId} AND "currentCount" > 0
        `
      throw createErr
    }
  } else {
    // Cache diz "cheio". Pode ser cheio de verdade OU cache defasado por locks
    // da Fase 7 que expiraram sem evento de escrita (ver occupancy.ts: o slot
    // "libera sozinho" na virada do dia). Só aqui — no limite da capacidade,
    // baixo volume — vale a transação autoritativa que reconta canonicamente,
    // cria SOB o lock (sem furar) e reconcilia o cache defasado.
    participant = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`

      const now = new Date()
      const occupied = await tx.participant.count({
        where: occupiedSlotsWhere(standId, now)
      })
      if (occupied >= standMaxRegistrations) {
        // Distinguir lotado real de vaga travada: o responsável precisa
        // entender quando a vaga libera (SPEC Fase 7, seção 4)
        const nextLocked = await tx.participant.findFirst({
          where: {
            standId,
            status: 'removed',
            isDeleted: false,
            slotLockedUntil: { gt: now }
          },
          orderBy: { slotLockedUntil: 'asc' },
          select: { slotLockedUntil: true }
        })
        throw new StandFullError(nextLocked?.slotLockedUntil ?? null)
      }

      // Mesma decisão do caminho rápido: cria ou revive — aqui sob o lock.
      const created = existente
        ? await tx.participant.update({
            where: { id: existente.id },
            data: { ...participantData, ...resetDaRevivencia }
          })
        : await tx.participant.create({ data: participantData })

      // Reconcilia o cache defasado para a contagem canônica + esta criação,
      // curando a defasagem de locks expirados para as próximas reservas rápidas.
      await tx.stand.update({
        where: { id: standId },
        data: { currentCount: occupied + 1 }
      })

      return created
    })
  }

  // ── REENFILEIRAMENTO ──────────────────────────────────────────────────────
  // Na REVIVÊNCIA é preciso o PAR, porque as duas funções cobrem conjuntos
  // complementares e nenhuma sozinha basta:
  //   `onBecameEligible` → cria linha faltante e revive as que estão em remoção
  //      (filtra `removalState != 'none'`)
  //   `enqueueFaceChange` → re-empurra a face nas que estão em `removalState:
  //      'none'` — inclusive as que ficaram `faceState: 'synced'` com a
  //      faceVersion ANTIGA, que a primeira ignora
  // Sem a segunda, quem foi removido e voltou manteria a foto velha no
  // equipamento para sempre. É o mesmo par que participants/update.ts usa após
  // uma re-captura, pela mesma razão.
  //
  // Em evento COM aprovação as duas são no-op seguras: `onBecameEligible` checa
  // elegibilidade e sai (o revivido está `pending`), e o `/work` também valida
  // elegibilidade antes de servir, então nada chega ao terminal antes da
  // aprovação. Quem dispara o fan-out ali é lib/participants/approval.ts.
  if (existente) {
    try {
      await onBecameEligible(event.id, participant.id)
      await enqueueFaceChange(participant.id)
    } catch (syncErr) {
      console.error('reenfileiramento do sync falhou na revivência:', syncErr)
    }
  } else if (event.requiresApprovalForAccess === false) {
    // Cadastro NOVO em evento sem aprovação: já fica elegível no registro →
    // identidade + fan-out (pós-commit). Idempotente e não-fatal.
    try {
      await onBecameEligible(event.id, participant.id)
    } catch (syncErr) {
      console.error('fan-out do sync falhou no registro de stand sem-aprovação:', syncErr)
    }
  }

  return {
    ok: true,
    participant: {
      id: participant.id,
      name: participant.name,
      createdAt: participant.createdAt
    }
  }
}
