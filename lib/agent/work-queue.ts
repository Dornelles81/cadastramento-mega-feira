/**
 * Quais linhas de `ParticipantTerminalSync` o `/api/agent/work` serve neste
 * ciclo — decidido INTEIRO no banco, ANTES do `LIMIT`.
 *
 * ── Por que (2026-10-06, Expofest) ─────────────────────────────────────────
 * O `/work` fazia `take: limit` por `createdAt` e só DEPOIS descartava, em JS,
 * as linhas esgotadas e as de participante não elegível. As linhas mortas são
 * as mais antigas, então ficavam para sempre na frente da fila: com 20
 * esgotadas (`nextAttemptAt = null` volta a casar com "pode tentar") e 20 de
 * pessoas removidas, 40 das 50 vagas iam para itens que o agente nunca aplica.
 * O ritmo caiu de ~9 para ~2,5 itens/min por terminal, sem nenhuma falha nova
 * — elas já tinham esgotado e só ocupavam espaço.
 *
 * Agora as vagas do `limit` só vão para o que o `/work` de fato serve. As
 * checagens em JS do `/work` continuam lá como defesa; com este filtro elas
 * não descartam mais nada (exceto foto que não decripta, ver abaixo).
 *
 * As regras NÃO são reescritas aqui, são as mesmas fontes:
 *   - teto: `sqlEsgotada` (lib/agent/retry-policy), o que a tela de saúde usa;
 *   - foto: `SQL_TEM_FOTO` (lib/face/presence), o espelho de
 *     `getFaceImageDataUrl`. Não detecta foto cifrada que não abre — essa
 *     ainda passa daqui e estoura no `/work`, como na reconciliação.
 *   - elegibilidade: status/isDeleted/aprovação de `lib/agent/eligibility`.
 *     A regra está em JS lá; a tradução abaixo precisa acompanhá-la.
 *     `scripts/test-work-fila.ts` confere as duas.
 *
 * Só LÊ. Nenhuma linha muda de estado: a esgotada continua `failed` com o
 * mesmo `attempts`/`lastError`, e é assim que a tela de saúde e o "Re-tentar"
 * continuam a enxergá-la.
 */
import { prisma } from '../prisma'
import { sqlEsgotada } from './retry-policy'
import { SQL_TEM_FOTO } from '../face/presence'

export async function idsServiveisDaFila(
  terminalIds: string[],
  agora: Date,
  limit: number
): Promise<string[]> {
  if (terminalIds.length === 0) return []
  const algumaFalha = `(s."faceState" = 'failed' OR s."cardState" = 'failed' OR s."removalState" = 'failed')`
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT s.id
       FROM participant_terminal_sync s
       JOIN participants p ON p.id = s."participantId"
       LEFT JOIN events e ON e.id = p."eventId"
      WHERE s."terminalId" = ANY($1::text[])
        -- 1) estado que pede ação (mesmo OR que o /work tinha no Prisma)
        AND (s."faceState" = 'pending' OR s."cardState" = 'pending' OR s."removalState" = 'pending'
             OR (${algumaFalha} AND (s."nextAttemptAt" IS NULL OR s."nextAttemptAt" <= $2)))
        -- 2) teto: linha com falha que esgotou não é servida. COALESCE porque
        --    lastError NULL deixa o LIKE nulo, e NOT NULL descartaria a linha.
        AND NOT (${algumaFalha} AND COALESCE(${sqlEsgotada('s."lastError"', 's.attempts')}, false))
        -- 3) sem employeeNo não há o que escrever nem remover no device
        AND p."employeeNo" IS NOT NULL
        -- 4) remoção é servida sempre; push só para quem é elegível AGORA.
        --    Evento ausente = exige aprovação (o "?? true" do /work).
        AND (s."removalState" IN ('pending', 'failed')
             OR (p.status = 'active' AND p."isDeleted" = false
                 AND ${SQL_TEM_FOTO}
                 AND (p."approvalStatus" = 'approved' OR e."requiresApprovalForAccess" = false)))
      ORDER BY s."createdAt" ASC, s.id ASC
      LIMIT $3`,
    terminalIds,
    agora,
    limit
  )
  return rows.map((r) => r.id)
}
