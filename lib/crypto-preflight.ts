/**
 * Verificação de partida da criptografia de biometria.
 *
 * Todo caminho de sync chama isto ANTES de selecionar participantes. Motivo: com
 * a MASTER_KEY errada, a decriptação falha para todo mundo e — sem esta checagem
 * — o sync não erra, ele simplesmente não encontra ninguém. "0 participantes,
 * sucesso" é o pior resultado possível: parece que não havia trabalho a fazer.
 *
 * Não basta conferir se a variável existe: uma chave PRESENTE e ERRADA (rotação
 * malfeita, .env de outro ambiente) passa nesse teste e falha em tudo. Por isso
 * a validação é empírica — descriptografa um registro real do banco.
 */
import { prisma } from './prisma'
import { decryptToString, isEncryptedPayload } from './crypto'

export class CryptoPreflightError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoPreflightError'
  }
}

export type PreflightResult =
  | { ok: true; checked: 'sample'; participantId: string }
  | { ok: true; checked: 'no-encrypted-data'; detail: string }

/**
 * Falha (lança) se a MASTER_KEY estiver ausente, curta, ou não abrir uma
 * biometria real. Só retorna quando há garantia de que o sync consegue ler as
 * fotos — ou quando não existe biometria criptografada para validar.
 */
export async function assertFaceCryptoReady(): Promise<PreflightResult> {
  const key = process.env.MASTER_KEY
  if (!key || key.length < 32) {
    throw new CryptoPreflightError(
      `MASTER_KEY ${!key ? 'ausente' : `com ${key.length} caracteres (mínimo 32)`}. ` +
        'Sem ela nenhuma biometria pode ser lida e o sync selecionaria ZERO participantes ' +
        'sem acusar erro. Configure-a antes de sincronizar.'
    )
  }

  // Amostra pequena: a primeira linha realmente criptografada que aparecer.
  // (Legado não-criptografado não serve para validar a chave.)
  const amostras = await prisma.participant.findMany({
    where: { faceData: { not: null } },
    select: { id: true, faceData: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  const alvo = amostras.find(a => a.faceData && isEncryptedPayload(Buffer.from(a.faceData)))
  if (!alvo) {
    return {
      ok: true,
      checked: 'no-encrypted-data',
      detail: amostras.length === 0
        ? 'nenhum participante com faceData no banco'
        : 'as amostras têm faceData legado (não criptografado) — nada a validar'
    }
  }

  try {
    const plain = decryptToString(Buffer.from(alvo.faceData!))
    if (!plain.startsWith('data:')) {
      throw new Error('conteúdo decriptado não é um data URL de imagem')
    }
  } catch (err: any) {
    throw new CryptoPreflightError(
      `MASTER_KEY presente mas NÃO abre a biometria do banco (participante ${alvo.id}): ${err?.message}. ` +
        'Chave de outro ambiente ou rotação incompleta. O sync foi abortado: continuar faria ' +
        'todos os participantes parecerem "sem foto".'
    )
  }

  return { ok: true, checked: 'sample', participantId: alvo.id }
}
