/**
 * Fixtures do teste de carga: CPFs válidos, payload facial de tamanho realista
 * e IPs distintos (o rate limit é por IP e mascararia a saturação — ver README).
 */

/** CPF válido e determinístico a partir de um índice (base 19 + i, evita repetidos). */
export function genCPF(i: number): string {
  const base = String(190000000 + i * 7).padStart(9, '0').slice(0, 9)
  const digits = base.split('').map(Number)

  const dv = (nums: number[], startWeight: number): number => {
    let sum = 0
    for (let k = 0; k < nums.length; k++) sum += nums[k] * (startWeight - k)
    const rest = (sum * 10) % 11
    return rest === 10 || rest === 11 ? 0 : rest
  }

  const d1 = dv(digits, 10)
  const d2 = dv([...digits, d1], 11)
  return base + d1 + d2
}

/**
 * Data URL JPEG sintética no tamanho alvo. O servidor NÃO decodifica a imagem
 * (só encryptString + hash), então o que importa para a carga é o TAMANHO:
 * ele domina o custo de rede, do AES e da escrita do bytea.
 * Calibre com FACE_KB — a captura real usa jpeg q=0.95 (~150–400 KB).
 */
export function makeFacePayload(targetKb: number): string {
  const bytes = Math.max(1, Math.round((targetKb * 1024 * 3) / 4)) // base64 infla 4/3
  const buf = Buffer.alloc(bytes)
  // cabeçalho JPEG (SOI + APP0) — o resto é ruído incompressível
  buf.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46], 0)
  for (let k = 10; k < bytes; k++) buf[k] = (k * 2654435761) % 251
  buf[bytes - 2] = 0xff
  buf[bytes - 1] = 0xd9 // EOI
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

/** IP único por virtual user: 50 celulares = 50 IPs (e não 1 IP levando 429). */
export function vuIp(i: number): string {
  return `203.0.113.${(i % 254) + 1}`
}

/** Marcador para a limpeza pós-teste (cai em Participant.customData). */
export const LOADTEST_TAG = '__loadtest'
