/**
 * Quem "existe" para as telas do admin.
 *
 * O sistema tem DOIS jeitos de sumir com um participante, e as telas do admin
 * só conheciam um deles:
 *
 *   isDeleted=true    → expurgo LGPD / retenção (cron), registro esvaziado
 *   status='removed'  → exclusão pelo responsável do stand (pages/api/stand-removal.ts).
 *                       A linha PERMANECE no banco de propósito: auditoria
 *                       imutável, slotLockedUntil (anti-rotatividade) e cota de
 *                       substituição dependem dela. A biometria e os documentos
 *                       já foram apagados no ato da exclusão.
 *
 * Contar/listar sem filtrar o segundo caso faz o painel exibir gente que o
 * gestor do stand já excluiu — foi exatamente o bug do card "Cadastrados"
 * travado em 3 no Expofest 2026.
 *
 * NÃO confundir com `occupiedSlotsRelationWhere()` (lib/stand-access/occupancy.ts):
 * lá a pergunta é "a VAGA está ocupada?", e um removido com slotLockedUntil no
 * futuro ainda ocupa. Aqui a pergunta é "esta PESSOA está cadastrada?", e ele
 * não conta. As duas convivem no mesmo arquivo de stands, cada uma no seu lugar.
 */

/** Where Prisma de participante visível (uso direto em `participant.findMany/count`). */
export const VISIBLE_PARTICIPANT = { status: 'active', isDeleted: false } as const

/**
 * Variante para `_count`/`include` a partir de Event/Stand — o vínculo já vem
 * implícito na relação. Função (não constante) para nunca compartilhar o mesmo
 * objeto entre queries, seguindo o padrão do módulo vizinho (occupancy).
 */
export function visibleParticipantsRelationWhere() {
  return { status: 'active', isDeleted: false }
}
