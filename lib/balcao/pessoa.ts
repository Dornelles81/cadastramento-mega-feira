/**
 * Achar a pessoa no balcão e dizer se a foto dela chegou aos terminais.
 *
 * ── BUSCA: só documento ────────────────────────────────────────────────────
 * CPF ou número de documento estrangeiro, e mais nada (decisão de 2026-09-28).
 * Nome ficou de fora: listar pessoas com foto para um operador temporário é
 * exposição sem necessidade. O id curto da portaria também: é enumerável.
 * O número vem do documento FÍSICO que a pessoa apresenta — digitá-lo é parte
 * da conferência de identidade, e por isso a troca de foto exige o documento
 * de novo (não um id que o navegador guardou).
 */
import { prisma } from '../prisma'
import { resolverDocumentoEstrangeiro } from '../participants/documento'
import { listAllocatedTerminalIds } from '../terminals/allocation'

// SEM a foto. O acompanhamento do sync consulta a cada 2 s: trazer os 60 KB
// do faceData em cada uma é exatamente o vazamento que levou a fatura do Neon
// a 3.883 GB em setembro. Só a busca inicial (conferência) pede a foto.
const SELECT_BASE = {
  id: true,
  name: true,
  cpf: true,
  eventId: true,
  standId: true,
  approvalStatus: true,
  faceVersion: true,
  stand: { select: { name: true } }
} as const
const SELECT_COM_FOTO = { ...SELECT_BASE, faceData: true, faceImageUrl: true } as const

export type ResultadoBusca =
  | { tipo: 'achou'; pessoa: any }
  | { tipo: 'ambiguo'; mensagem: string }
  | { tipo: 'nada' }

/**
 * Resolve UMA pessoa ativa do evento pelo documento. Removido e expurgado não
 * existem aqui (mesma resposta de "não encontrado").
 */
export async function buscarPorDocumento(
  eventId: string,
  entrada: string,
  opcoes: { comFoto?: boolean } = {}
): Promise<ResultadoBusca> {
  const select = opcoes.comFoto ? SELECT_COM_FOTO : SELECT_BASE
  const bruto = (entrada ?? '').trim()
  if (!bruto || bruto.length > 40) return { tipo: 'nada' }
  const vivo = { eventId, status: 'active', isDeleted: false }

  // 1) CPF: 11 dígitos, com ou sem pontuação.
  const digitos = bruto.replace(/\D/g, '')
  if (digitos.length === 11) {
    const p = await prisma.participant.findFirst({ where: { ...vivo, cpf: digitos }, select })
    if (p) return { tipo: 'achou', pessoa: p }
  }

  // 2) Identidade completa digitada (ex.: "PP-AR:AB1234567", que é o que a
  //    mensagem de ambiguidade manda digitar).
  const exato = await prisma.participant.findFirst({ where: { ...vivo, cpf: bruto }, select })
  if (exato) return { tipo: 'achou', pessoa: exato }

  // 3) Número solto de documento estrangeiro. Ambiguidade NÃO vira escolha:
  //    entregar o primeiro seria trocar a foto da pessoa errada.
  const doc = await resolverDocumentoEstrangeiro(prisma as any, eventId, bruto)
  if (doc.tipo === 'ambiguo') return { tipo: 'ambiguo', mensagem: doc.mensagem }
  if (doc.tipo === 'unico') {
    const p = await prisma.participant.findFirst({ where: { ...vivo, cpf: doc.identidade }, select })
    if (p) return { tipo: 'achou', pessoa: p }
  }
  return { tipo: 'nada' }
}

/** CPF mascarado para a tela: 123.***.***-44; documento estrangeiro: só o fim. */
export function documentoMascarado(valor: string): string {
  const d = valor.replace(/\D/g, '')
  if (/^\d{11}$/.test(valor)) return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
  return valor.length > 4 ? `${'•'.repeat(Math.min(6, valor.length - 4))}${valor.slice(-4)}` : '••••'
}

export type EstadoTerminais =
  | { estado: 'ok'; terminais: number }
  | { estado: 'recusada'; terminais: number; recusaram: number; motivo: 'foto-grande' | 'modelagem' | 'outro' }
  | { estado: 'pendente'; terminais: number; chegou: number }
  | { estado: 'nao-aprovado' }
  | { estado: 'sem-terminal' }

/**
 * Onde a foto ATUAL da pessoa está nos terminais que atendem o evento agora.
 *
 * "Chegou" = linha `synced` com a MESMA `faceVersion` da foto atual. Não basta
 * `synced`: esse estado pode ser da foto anterior.
 *
 * "Recusada" = linha `failed` com tentativa DEPOIS de `desde` (a hora da troca).
 * O ack de falha não grava a versão tentada, então é o relógio que separa a
 * recusa da foto nova de uma recusa antiga da foto que veio ser substituída.
 */
export async function estadoNosTerminais(
  pessoa: { id: string; eventId: string | null; approvalStatus: string | null; faceVersion: string | null },
  desde: Date | null,
  requerAprovacao: boolean
): Promise<EstadoTerminais> {
  if (requerAprovacao && pessoa.approvalStatus !== 'approved') return { estado: 'nao-aprovado' }
  if (!pessoa.eventId) return { estado: 'sem-terminal' }
  const terminais = await listAllocatedTerminalIds(pessoa.eventId)
  if (terminais.length === 0) return { estado: 'sem-terminal' }

  const linhas = await prisma.participantTerminalSync.findMany({
    where: { participantId: pessoa.id, terminalId: { in: terminais }, removalState: 'none' },
    select: { terminalId: true, faceState: true, faceVersion: true, lastError: true, lastAttemptAt: true }
  })

  const recusas = linhas.filter(
    (l) => l.faceState === 'failed' && (!desde || (l.lastAttemptAt && l.lastAttemptAt >= desde))
  )
  if (recusas.length > 0) {
    const e = (recusas[0].lastError ?? '').toLowerCase()
    const motivo = e.includes('badjsoncontent') && e.includes('faceurl')
      ? 'foto-grande'
      : e.includes('subpic') || e.includes('model')
        ? 'modelagem'
        : 'outro'
    return { estado: 'recusada', terminais: terminais.length, recusaram: recusas.length, motivo }
  }

  const chegou = linhas.filter(
    (l) => l.faceState === 'synced' && !!pessoa.faceVersion && l.faceVersion === pessoa.faceVersion
  ).length
  if (chegou >= terminais.length) return { estado: 'ok', terminais: terminais.length }
  return { estado: 'pendente', terminais: terminais.length, chegou }
}
