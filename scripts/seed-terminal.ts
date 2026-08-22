/**
 * seed-terminal.ts — cadastra um terminal físico e o aloca a um evento.
 *
 * Idempotente: rodar de novo atualiza o cadastro e não duplica a alocação.
 * A senha entra CRIPTOGRAFADA (AES-256-GCM, mesmo padrão do faceData) e nunca
 * é gravada em claro — vem de DEVICE_PASS só no momento do cadastro.
 *
 * Uso:
 *   DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts
 *   DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts --ip=192.168.1.30 --evento=treinamento-credenciamento
 *   DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts --ip=... --capacidade=50000
 *
 * Se o terminal estiver alcançável, modelo/firmware/serial são lidos do próprio
 * device (/ISAPI/System/deviceInfo) e a CAPACIDADE DE FACES do
 * /ISAPI/AccessControl/UserInfo/capabilities — em vez de digitados ou herdados
 * do @default(5000) do schema, que não vale para nenhum modelo em uso.
 * Terminal NOVO cujo aparelho não responda e cujo modelo não esteja mapeado é
 * RECUSADO até que --capacidade= seja informada.
 *
 * Ao final faz o BACKFILL: o terminal nasce com o roster elegível já enfileirado,
 * em vez de esperar a reconciliação do agente. Nada é escrito no device aqui —
 * só as linhas de sync pendentes, que o agente aplica no próximo ciclo.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { prisma } from '../lib/prisma'
import { encryptString } from '../lib/crypto'
import { HikvisionClient } from '../lib/hikvision/client'
import { createAllocation, resolveActiveAllocation } from '../lib/terminals/allocation'
import { backfillTerminal } from '../lib/agent/sync-enqueue'

const argv = process.argv.slice(2)
const arg = (n: string) => argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')

const IP        = arg('ip') || process.env.DEVICE_IP || '192.168.1.30'
const PORT      = Number(arg('porta') || process.env.DEVICE_PORT || 80)
const USE_HTTPS = (arg('https') || process.env.DEVICE_USE_HTTPS) === 'true'
const USER      = arg('usuario') || process.env.HIKVISION_USER || 'admin'
const PASS      = process.env.DEVICE_PASS || ''
const FDID      = arg('fdid') || process.env.DEVICE_FDID || '1'
const NOME      = arg('nome') || 'Terminal Bancada'
const EVENTO    = arg('evento') || 'treinamento-credenciamento'
const CAPACIDADE = arg('capacidade') !== undefined ? Number(arg('capacidade')) : undefined

/** Lê a identificação real do equipamento; null se não estiver alcançável. */
async function lerDeviceInfo(): Promise<{ deviceModel: string | null; firmwareVersion: string | null; serialNumber: string | null } | null> {
  if (!PASS) return null
  try {
    const c = new HikvisionClient({ ipAddress: IP, port: PORT, useHttps: USE_HTTPS, username: USER, password: PASS })
    const xml = String(await c.getDeviceInfo())
    const pick = (tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null
    return { deviceModel: pick('model'), firmwareVersion: pick('firmwareVersion'), serialNumber: pick('serialNumber') }
  } catch (e: any) {
    console.log(`⚠️  device não respondeu (${e?.message}) — cadastrando sem modelo/firmware/serial`)
    return null
  }
}

/**
 * Capacidade de faces PERGUNTADA AO PRÓPRIO EQUIPAMENTO.
 *
 * Fonte melhor que qualquer ficha técnica, e isso não é teoria: em 23/08/2026 o
 * datasheet oficial do DS-K1T673DX-BR (assets.hikvision.com, revisão 2024-10-08)
 * dizia "Face capacity 10,000", e os dois aparelhos em bancada, no firmware
 * V3.18.0, responderam `maxRecordNum = 50000`. Para o DS-K1T671M-L havia DOIS
 * datasheets oficiais em conflito — 6.000 no global, 10.000 no pt-BR — e o
 * aparelho respondeu 10.000. Ficha técnica envelhece e varia por região; o
 * firmware sabe de si.
 *
 * `UserInfo/capabilities.UserInfo.maxRecordNum` é o teto de usuários e
 * `FDLib/capabilities.FDRecordDataMaxNum` o de registros faciais. Nos três
 * aparelhos os dois números coincidem; havendo divergência vale o MENOR, que é
 * o que de fato limita (não adianta caber o usuário se não couber a face).
 */
async function lerCapacidadeDoDevice(): Promise<number | null> {
  if (!PASS) return null
  try {
    const { DigestAuth } = await import('../lib/hikvision/digest-auth')
    const auth = new DigestAuth(USER, PASS)
    const base = `${USE_HTTPS ? 'https' : 'http'}://${IP}:${PORT}`
    const ler = async (caminho: string, extrai: (d: any) => unknown) => {
      try {
        const r = await auth.request({
          method: 'GET', url: base + caminho,
          headers: { Accept: 'application/json' }, timeout: 15000
        })
        const n = Number(extrai(r.data))
        return Number.isFinite(n) && n > 0 ? n : null
      } catch { return null }
    }
    const candidatos = [
      await ler('/ISAPI/AccessControl/UserInfo/capabilities?format=json', (d) => d?.UserInfo?.maxRecordNum),
      await ler('/ISAPI/Intelligent/FDLib/capabilities?format=json', (d) => d?.FDRecordDataMaxNum)
    ].filter((n): n is number => n !== null)
    return candidatos.length ? Math.min(...candidatos) : null
  } catch {
    return null
  }
}

/**
 * Mapa modelo → capacidade, DELIBERADAMENTE VAZIO.
 *
 * Só entra aqui número confirmado no próprio equipamento — nunca copiado de
 * ficha técnica ou de página de revenda. Foi cópia de revenda que produziu o
 * "50.000 faces" que quase virou código: coincidiu com a verdade por acaso,
 * enquanto o datasheet do fabricante dizia outra coisa.
 *
 * Existe como rede para firmware que não exponha `capabilities`. Enquanto o
 * device responder, este mapa não é consultado.
 */
const CAPACIDADE_POR_MODELO: Record<string, number> = {}

/**
 * Resolve a capacidade a gravar, em ordem de confiança decrescente.
 * `null` = não foi possível determinar; quem cria terminal novo aborta.
 */
function resolverCapacidade(
  informada: number | undefined,
  doDevice: number | null,
  modelo: string | null | undefined,
  existente: number | undefined
): { valor: number | null; origem: string } {
  // A flag vence tudo: é intenção humana explícita. Mas se contradiz o
  // equipamento, isso aparece — discordância silenciosa aqui é o bug de novo.
  if (informada !== undefined) {
    if (doDevice !== null && doDevice !== informada) {
      console.log(`⚠️  --capacidade=${informada} diverge do que o device afirma (${doDevice}). Usando a sua.`)
    }
    return { valor: informada, origem: '--capacidade' }
  }
  if (doDevice !== null) return { valor: doDevice, origem: 'lido do equipamento (ISAPI)' }
  const doMapa = modelo ? CAPACIDADE_POR_MODELO[modelo] : undefined
  if (doMapa !== undefined) return { valor: doMapa, origem: `mapa do modelo ${modelo}` }
  if (existente !== undefined) return { valor: existente, origem: 'preservado do cadastro anterior' }
  return { valor: null, origem: 'indeterminada' }
}

async function main() {
  const evento = await prisma.event.findFirst({
    where: { slug: EVENTO },
    select: { id: true, name: true, startDate: true, endDate: true }
  })
  if (!evento) throw new Error(`Evento com slug "${EVENTO}" não encontrado`)

  const existente = await prisma.terminal.findFirst({
    where: { ipAddress: IP },
    select: { id: true, passwordEncrypted: true, capacityLimit: true }
  })
  if (!existente && !PASS) {
    throw new Error('Terminal novo exige a senha: DEVICE_PASS=<senha> tsx scripts/seed-terminal.ts')
  }

  const info = await lerDeviceInfo()

  // Capacidade: perguntada ao equipamento, com a flag como override e o cadastro
  // anterior como piso. Terminal NOVO sem nenhuma dessas fontes é recusado — o
  // @default(5000) do schema não corresponde a nenhum modelo em uso, e herdá-lo
  // em silêncio foi o que obrigou a corrigir os três terminais à mão em 22/08.
  const capacidadeDoDevice = await lerCapacidadeDoDevice()
  const { valor: capacidade, origem: origemCapacidade } = resolverCapacidade(
    CAPACIDADE, capacidadeDoDevice, info?.deviceModel, existente?.capacityLimit
  )
  if (capacidade === null) {
    throw new Error(
      `não foi possível determinar a capacidade de faces deste terminal.\n` +
      `   O equipamento não respondeu ao /ISAPI/.../capabilities e o modelo ` +
      `${info?.deviceModel ? `"${info.deviceModel}" não está no mapa` : 'é desconhecido'}.\n` +
      `   Informe explicitamente:  --capacidade=<faces>\n` +
      `   O número está na tela do próprio terminal (Configuração → Sistema) ou na ficha do modelo.\n` +
      `   Cadastrar sem isso faria o terminal herdar 5000 do schema, que não vale para nenhum modelo em uso.`
    )
  }

  const dados = {
    name: NOME,
    ipAddress: IP,
    port: PORT,
    useHttps: USE_HTTPS,
    username: USER,
    fdid: FDID,
    isActive: true,
    capacityLimit: capacidade,
    ...(info ?? {}),
    // Senha só é reescrita quando DEVICE_PASS é fornecida (senão preserva a que
    // já está criptografada no banco).
    ...(PASS ? { passwordEncrypted: encryptString(PASS) } : {})
    // `eventId` não é mais escrito: o fan-out, o /work e a reconciliação leem a
    // ALOCAÇÃO (criada abaixo), que é a fonte de verdade do escopo do sync.
  }

  const terminal = existente
    ? await prisma.terminal.update({ where: { id: existente.id }, data: dados })
    : await prisma.terminal.create({ data: dados })

  console.log(`${existente ? '♻️  atualizado' : '✅ criado'}: Terminal ${terminal.id}`)
  console.log(`   ${terminal.name} — ${terminal.ipAddress}:${terminal.port}`)
  console.log(`   modelo=${terminal.deviceModel ?? '(n/d)'} firmware=${terminal.firmwareVersion ?? '(n/d)'} serial=${terminal.serialNumber ?? '(n/d)'}`)
  console.log(`   capacidade=${terminal.capacityLimit.toLocaleString('pt-BR')} faces (${origemCapacidade})`)
  console.log(`   FDID=${terminal.fdid} | senha criptografada: ${terminal.passwordEncrypted ? 'sim' : 'NÃO'}`)

  // Alocação ao evento, pelo período do próprio evento.
  const jaAlocado = await prisma.terminalEvent.findFirst({
    where: { terminalId: terminal.id, eventId: evento.id, isActive: true },
    select: { id: true, startDate: true, endDate: true }
  })
  if (jaAlocado) {
    console.log(`♻️  alocação já existe: ${jaAlocado.id} (${jaAlocado.startDate.toISOString().slice(0, 10)} → ${jaAlocado.endDate.toISOString().slice(0, 10)})`)
  } else {
    const aloc = await createAllocation({
      terminalId: terminal.id,
      eventId: evento.id,
      startDate: evento.startDate,
      endDate: evento.endDate
    })
    console.log(`✅ alocado a "${evento.name}": ${aloc.id} (${aloc.startDate.toISOString().slice(0, 10)} → ${aloc.endDate.toISOString().slice(0, 10)})`)
  }

  // Fan-out imediato: o terminal nasce POPULADO com o roster elegível do evento.
  // Sem isto ele fica com ZERO linha de sync até a reconciliação do agente
  // passar (até `reconcileMs`, e nunca sob `--no-reconcile`) — na instalação
  // isso se parece exatamente com "o terminal não sincroniza", que é o
  // diagnóstico errado na pior hora.
  //
  // Vai DEPOIS da alocação de propósito: `backfillTerminal` resolve o escopo
  // pela alocação VIGENTE; chamado antes, não acharia evento e sairia no-op.
  // Idempotente (upsert), então re-rodar o seed não duplica nem re-empurra.
  await backfillTerminal(terminal.id)
  const linhas = await prisma.participantTerminalSync.count({ where: { terminalId: terminal.id } })
  console.log(`🌱 backfill: ${linhas} linha(s) de sync neste terminal`)

  if (linhas === 0) {
    // Zero é um resultado legítimo (roster vazio) OU um terminal que não vai
    // sincronizar nada. Dizer QUAL evita a caça ao fantasma na instalação.
    const escopo = await resolveActiveAllocation(terminal.id)
    if (!escopo.ok) {
      console.log(`   ⚠️  sem alocação vigente agora — ${escopo.detail}`)
      console.log('   O terminal só receberá roster dentro do período da alocação.')
    } else {
      console.log(`   (roster de "${escopo.allocation.eventName}" não tem ninguém elegível ainda:`)
      console.log('    exige status=active, face utilizável, employeeNo e — se o evento pedir — aprovação)')
    }
  }
}

main()
  .catch(e => { console.error('🚨', e?.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
