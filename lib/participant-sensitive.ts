import { Prisma } from '@prisma/client'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Conjunto único de campos sensíveis a limpar quando um participante é
 * removido ou expurgado (LGPD): biometria facial, documentos e metadados de
 * captura. Usado pela exclusão via stand (Fase 5) e pelo cron de expurgo
 * (lgpd-purge) para garantir que ambos apaguem exatamente o mesmo conjunto.
 *
 * documents usa DbNull (não `{}`): o critério do expurgo seleciona
 * `documents != null`, e um objeto vazio re-selecionaria o registro todo dia.
 *
 * customData entra no expurgo (decisão de 2026-06-12): a trilha de auditoria
 * que se mantém é quem (nome/CPF/contato) e com que base (consentimento) —
 * cargo/empresa/placa e referências de documentos em campos custom são dados
 * pessoais sem finalidade após o evento. O vínculo com o stand permanece
 * relacional (standId), nada se perde para ocupação/relatórios.
 */
export const SENSITIVE_PARTICIPANT_CLEAR = {
  faceData: null,
  faceImageUrl: null,
  faceInterocularPx: null,
  deviceInfo: null,
  captureLocation: null,
  browserInfo: null,
  documents: Prisma.DbNull,
  customData: Prisma.DbNull
} as const

// ── Arquivos físicos referenciados (uploads/) ───────────────────────────────
// Campos custom tipo file gravam caminhos /api/uploads/<nome> em customData.
// Ao limpar a referência, o arquivo precisa morrer junto: um documento cuja
// referência sumiu é dado sensível órfão que nenhum expurgo futuro alcança.

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const UPLOAD_REF_PATTERN = /\/(?:api\/)?uploads\/([^"\\]+)/g

/** Extrai nomes de arquivos de uploads referenciados em valores/JSONs. */
export function extractUploadRefs(...sources: unknown[]): string[] {
  const refs = new Set<string>()
  for (const src of sources) {
    if (src === null || src === undefined) continue
    const s = typeof src === 'string' ? src : JSON.stringify(src)
    // exec em loop (sem matchAll): compatível com o target antigo do tsconfig
    const pattern = new RegExp(UPLOAD_REF_PATTERN.source, 'g')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(s)) !== null) {
      refs.add(decodeURIComponent(m[1]))
    }
  }
  return Array.from(refs)
}

/**
 * Apaga os arquivos físicos de uploads. Nunca lança: falha não pode bloquear
 * o expurgo/exclusão — o chamador registra `failed` para reprocessamento.
 * Arquivo inexistente (ENOENT) conta como sucesso: é o estado desejado (em
 * produção serverless os uploads nunca persistem em disco).
 */
export async function deleteUploadFiles(
  filenames: string[]
): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = []
  const failed: string[] = []
  for (const name of filenames) {
    const target = path.resolve(UPLOAD_DIR, name)
    if (!target.startsWith(UPLOAD_DIR + path.sep)) {
      failed.push(name) // path traversal — nunca apagar fora do diretório
      continue
    }
    try {
      await fs.unlink(target)
      deleted.push(name)
    } catch (e: any) {
      if (e?.code === 'ENOENT') deleted.push(name)
      else failed.push(name)
    }
  }
  return { deleted, failed }
}
