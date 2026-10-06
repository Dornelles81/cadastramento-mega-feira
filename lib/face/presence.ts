/**
 * "Tem foto?" decidido NO BANCO, sem trazer os bytes da biometria.
 *
 * Existe por causa da fatura do Neon de setembro/2026: 3.883 GB de
 * transferência contra 10,55 GB em agosto. A reconciliação do agente roda a
 * cada ciclo, para CADA terminal, e selecionava o `faceData` de todos os
 * participantes do evento só para saber se a foto existia — 135 MB por chamada
 * com o Expofest cheio. A resposta é um booleano; os bytes nunca foram usados.
 *
 * ── ESPELHO de `getFaceImageDataUrl` (lib/face-image.ts) ─────────────────
 * A expressão abaixo reproduz a decisão de presença daquela função:
 *   - `faceData` no formato cifrado atual → `isEncryptedPayload` (lib/crypto):
 *     mais de 1+12+16 bytes (versão + IV + tag) e primeiro byte = versão 1;
 *   - `faceData` que NÃO é payload cifrado (hash SHA-256 legado) não conta;
 *   - legado em `faceImageUrl`: data URL ou URL http(s).
 *
 * O que ela NÃO faz é decriptar. Uma foto cifrada que não abre (MASTER_KEY
 * errada, payload corrompido) conta como "tem foto" aqui — e a falha estoura
 * no `/api/agent/work`, que decripta para enviar ao terminal e lança o mesmo
 * `FaceDecryptionError`. Decisão aceita em 2026-09-28: mesmo erro alto, ponto
 * diferente. Não use esta função onde a foto É o produto.
 *
 * Se `getFaceImageDataUrl` ou `isEncryptedPayload` mudarem, esta expressão tem
 * que mudar junto. `scripts/test-face-presenca.ts` compara as duas nos casos
 * de fronteira e é o que avisa quando se afastarem.
 */
import { prisma } from '../prisma'

// O primeiro byte é lido de `substring(... from 1 for 1)`, não de
// `get_byte("faceData", 0)` direto: `get_byte` destoasta a foto INTEIRA (~60 KB)
// só para olhar um byte, e o `substring` de bytea busca só o pedaço do TOAST
// que contém o início. Mesmo resultado (conferido nos 4.147 participantes de
// produção em 2026-10-06); medido no /work do Expofest: 75 ms → 24 ms por
// chamada. `octet_length` não destoasta: lê o tamanho do cabeçalho.
export const SQL_TEM_FOTO = `(
  (octet_length("faceData") > 29 AND get_byte(substring("faceData" from 1 for 1), 0) = 1)
  OR "faceImageUrl" LIKE 'data:%'
  OR "faceImageUrl" ~ '^https?://'
)`

/**
 * Ids dos participantes do evento (não apagados, com employeeNo) que têm foto.
 * Mesmo recorte da consulta de participantes da reconciliação. Trafega só os
 * ids: ~90 KB para o Expofest inteiro.
 */
export async function idsComFotoNoEvento(eventId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM participants
      WHERE "eventId" = $1 AND "isDeleted" = false AND "employeeNo" IS NOT NULL
        AND ${SQL_TEM_FOTO}`,
    eventId
  )
  return new Set(rows.map((r) => r.id))
}

/** Dos ids informados, quais têm foto. Usado pelo teste do espelho. */
export async function idsComFoto(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM participants WHERE id = ANY($1::text[]) AND ${SQL_TEM_FOTO}`,
    ids
  )
  return new Set(rows.map((r) => r.id))
}
