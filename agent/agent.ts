/**
 * Núcleo do agente (F3): um ciclo = heartbeat + buscar trabalho + aplicar +
 * ack. Exporta `runOnce` (testável, com --dry-run que NÃO escreve no device) e
 * `mainLoop`. SEM execução no topo do módulo (o entrypoint é agent/run.ts).
 *
 * Segurança: o agente recebe a credencial do terminal já decriptada da nuvem
 * (/api/agent/terminals) e a face já em claro (/api/agent/work). Nunca toca
 * MASTER_KEY nem o banco — só ISAPI na LAN + HTTP por token.
 */
import type { AgentConfig } from './config'
import { loadConfig } from './config'
import {
  getTerminals, getWork, postAck, postHeartbeat,
  type Ack, type HeartbeatItem, type PushItem
} from './api'
import { applyPush, applyRemoval } from './apply'
import { runReconcile } from './reconcile'
import { log, logError } from './log'
import { HikvisionClient } from '../lib/hikvision/client'

export interface RunResult {
  pushCount: number
  removalCount: number
  applied: number
  failed: number
  planned: string[] // descrição das ops (preenchido sempre; é o que o dry-run mostra)
}

/**
 * Extrai o número de usuários da resposta do ISAPI
 * `/AccessControl/UserInfo/Count`. A forma canônica é
 * `{ UserInfoCount: { userNumber: N } }`, mas o formato varia entre modelo e
 * firmware — e aqui já convivem dois (DS-K1T673DX-BR V3.18.0 e
 * DS-K1T671M-L V3.2.30). Por isso tenta as variantes conhecidas e, não
 * reconhecendo nenhuma, devolve `undefined` em vez de chutar: contagem ausente
 * é honesta, contagem errada vira decisão de capacidade errada.
 */
function extrairUserCount(resp: any): number | undefined {
  const candidatos = [
    resp?.UserInfoCount?.userNumber,
    resp?.UserInfoCount?.userCount,
    resp?.userNumber,
    resp?.userCount
  ]
  for (const v of candidatos) {
    const n = typeof v === 'string' ? Number(v) : v
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n
  }
  return undefined
}

function noCredAcks(item: PushItem): Ack[] {
  const a: Ack[] = []
  if (item.needFace) a.push({ syncId: item.syncId, kind: 'face', status: 'failed', error: 'sem credencial do terminal' })
  if (item.needCard) a.push({ syncId: item.syncId, kind: 'card', status: 'failed', error: 'sem credencial do terminal' })
  return a
}

export async function runOnce(cfg: AgentConfig, opts: { dryRun?: boolean } = {}): Promise<RunResult> {
  const terminals = await getTerminals(cfg)
  const clients = new Map<string, HikvisionClient>()
  for (const t of terminals) {
    if (!t.password) continue
    clients.set(t.id, new HikvisionClient({
      ipAddress: t.ipAddress, port: t.port, useHttps: t.useHttps, username: t.username, password: t.password
    }))
  }

  // Heartbeat: sonda leve por terminal (getUserCount) → lastSeenAt/saúde no admin.
  // Pulado no dry-run (não toca o device).
  //
  // A contagem VAI JUNTO. Antes, o `getUserCount()` era chamado e o resultado
  // jogado fora — servia só como prova de vida. Com isso a nuvem não tinha ideia
  // de quantas faces existem no device, e o `capacityLimit` era uma coluna
  // estática que ninguém comparava com a realidade. Num evento de 8.000 pessoas
  // contra um limite de 5.000, o terminal enche, passa a recusar, e a primeira
  // notícia disso seria um push falhando no meio da feira. A informação já era
  // lida; só não era guardada.
  if (!opts.dryRun && clients.size > 0) {
    const hb: HeartbeatItem[] = []
    for (const t of terminals) {
      const c = clients.get(t.id)
      if (!c) continue
      try {
        const resp = await c.getUserCount()
        hb.push({ terminalId: t.id, online: true, userCount: extrairUserCount(resp) })
      } catch (e: any) {
        hb.push({ terminalId: t.id, online: false, error: String(e?.message ?? e).slice(0, 300) })
      }
    }
    await postHeartbeat(cfg, hb)
  }

  const work = await getWork(cfg)
  const planned: string[] = []
  const acks: Ack[] = []

  for (const item of work.push) {
    const ops = ['addUser', item.needFace ? 'uploadFace' : null, item.needCard ? 'registerCard' : null]
      .filter(Boolean).join('+')
    planned.push(`PUSH emp=${item.employeeNo} term=${item.terminalId} [${ops}] validEnd=${item.validEnd}`)
    if (opts.dryRun) continue
    const c = clients.get(item.terminalId)
    if (!c) { acks.push(...noCredAcks(item)); continue }
    acks.push(...await applyPush(c, item))
  }

  for (const item of work.removals) {
    planned.push(`REMOVAL emp=${item.employeeNo} term=${item.terminalId} [deleteUser]`)
    if (opts.dryRun) continue
    const c = clients.get(item.terminalId)
    if (!c) { acks.push({ syncId: item.syncId, kind: 'removal', status: 'failed', error: 'sem credencial do terminal' }); continue }
    acks.push(await applyRemoval(c, item))
  }

  if (!opts.dryRun) await postAck(cfg, acks)

  return {
    pushCount: work.push.length,
    removalCount: work.removals.length,
    applied: acks.filter(a => a.status === 'success').length,
    failed: acks.filter(a => a.status === 'failed').length,
    planned
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export interface MainLoopOptions {
  /**
   * Desliga a reconciliação periódica. Para operação ASSISTIDA (primeira
   * execução, bancada, diagnóstico): o agente só aplica o que já está
   * enfileirado, sem varrer o roster do device e enfileirar correções.
   */
  reconcile?: boolean
}

export async function mainLoop(opts: MainLoopOptions = {}): Promise<void> {
  const cfg = loadConfig()
  const reconcileEnabled = opts.reconcile !== false
  log(
    `[agente] iniciado | base=${cfg.baseUrl} | poll=${cfg.pollMs}ms | ` +
    (reconcileEnabled ? `reconcile=${cfg.reconcileMs}ms` : 'reconcile=DESLIGADO (--no-reconcile)')
  )
  // Começa em "agora", não em 0. Com `lastReconcile = 0` a conta era
  // `Date.now() - 0` — a era Unix inteira em ms —, sempre maior que qualquer
  // reconcileMs finito, então a reconciliação disparava JÁ NO PRIMEIRO CICLO,
  // ignorando a cadência. Num evento com roster cheio isso significa ligar o
  // agente e imediatamente varrer o device e enfileirar o sync inteiro, que é
  // exatamente o que ninguém espera de uma primeira execução de observação.
  // Agora o primeiro reconcile acontece só depois de um intervalo completo.
  let lastReconcile = Date.now()
  for (;;) {
    try {
      const r = await runOnce(cfg)
      if (r.pushCount + r.removalCount > 0) {
        log(`[agente] push=${r.pushCount} removal=${r.removalCount} ok=${r.applied} falhas=${r.failed}`)
      }
      // Reconciliação em cadência própria (mais pesada — lista o roster do device).
      if (reconcileEnabled && Date.now() - lastReconcile >= cfg.reconcileMs) {
        lastReconcile = Date.now()
        try {
          const rc = await runReconcile(cfg)
          // deleteFailures entra na condição: um ciclo que SÓ falhou não pode
          // passar despercebido por não ter nada de positivo para somar.
          if (rc.pushes + rc.removals + rc.directDeletes + rc.deleteFailures > 0) {
            log(`[agente] reconcile: pushes=${rc.pushes} removals=${rc.removals} deletes=${rc.directDeletes} falhas=${rc.deleteFailures} (${rc.terminals} terminais)`)
          }
        } catch (e: any) {
          logError(`[agente] erro na reconciliacao: ${e?.message ?? e}`)
        }
      }
    } catch (e: any) {
      logError(`[agente] erro no ciclo: ${e?.message ?? e}`)
    }
    await sleep(cfg.pollMs)
  }
}
