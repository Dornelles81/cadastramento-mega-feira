/**
 * Texto do badge de removido — puro, sem Prisma, seguro para componente client.
 *
 * Vive separado de removal-badge.ts de propósito: aquele importa o Prisma para
 * ler o ator no audit log (servidor); importá-lo de uma página 'use client'
 * arrastaria o Prisma para o bundle do navegador.
 */

export interface RemocaoBadge {
  at: string | null
  by: string | null
}

/** "Excluído pelo gestor em 17/08 por fulano@..." — a causa do CPF bloqueado. */
export function textoRemocao(removal?: RemocaoBadge | null): string {
  const quando = removal?.at
    ? new Date(removal.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null
  const quem = removal?.by || 'responsável do stand'
  return `Excluído pelo gestor${quando ? ` em ${quando}` : ''} por ${quem}`
}
