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
import { HikvisionClient } from '../lib/hikvision/client'

export interface RunResult {
  pushCount: number
  removalCount: number
  applied: number
  failed: number
  planned: string[] // descrição das ops (preenchido sempre; é o que o dry-run mostra)
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
  if (!opts.dryRun && clients.size > 0) {
    const hb: HeartbeatItem[] = []
    for (const t of terminals) {
      const c = clients.get(t.id)
      if (!c) continue
      try { await c.getUserCount(); hb.push({ terminalId: t.id, online: true }) }
      catch (e: any) { hb.push({ terminalId: t.id, online: false, error: String(e?.message ?? e).slice(0, 300) }) }
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

export async function mainLoop(): Promise<void> {
  const cfg = loadConfig()
  console.log(`[agente] iniciado · base=${cfg.baseUrl} · poll=${cfg.pollMs}ms · reconcile=${cfg.reconcileMs}ms`)
  let lastReconcile = 0
  for (;;) {
    try {
      const r = await runOnce(cfg)
      if (r.pushCount + r.removalCount > 0) {
        console.log(`[agente] ${new Date().toISOString()} push=${r.pushCount} removal=${r.removalCount} ok=${r.applied} falhas=${r.failed}`)
      }
      // Reconciliação em cadência própria (mais pesada — lista o roster do device).
      if (Date.now() - lastReconcile >= cfg.reconcileMs) {
        lastReconcile = Date.now()
        try {
          const rc = await runReconcile(cfg)
          if (rc.pushes + rc.removals + rc.directDeletes > 0) {
            console.log(`[agente] reconcile: pushes=${rc.pushes} removals=${rc.removals} deletes=${rc.directDeletes} (${rc.terminals} terminais)`)
          }
        } catch (e: any) {
          console.error(`[agente] erro na reconciliação: ${e?.message ?? e}`)
        }
      }
    } catch (e: any) {
      console.error(`[agente] erro no ciclo: ${e?.message ?? e}`)
    }
    await sleep(cfg.pollMs)
  }
}
