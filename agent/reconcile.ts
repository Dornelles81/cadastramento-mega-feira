/**
 * Reconciliação no agente (F4): lista o roster REAL de cada terminal (paginado),
 * reporta à nuvem (/api/agent/reconcile), e deleta diretamente os órfãos que a
 * nuvem mandar (sem linha de sync). As correções de push/removal que a nuvem
 * enfileira são aplicadas pelo loop normal (/work). O agente NÃO decide nada —
 * só lista, reporta e executa o que a nuvem mandou.
 */
import type { AgentConfig } from './config'
import { getTerminals, postReconcile, type DeviceUser } from './api'
import { HikvisionClient } from '../lib/hikvision/client'

// Cliente mínimo que o lister precisa (facilita testar com mock).
export interface RosterClient {
  searchUsers(employeeNo?: string, searchResultPosition?: number, maxResults?: number): Promise<any>
}

const PAGE = 30

/**
 * Lista TODOS os usuários do device, paginando 30/página até `totalMatches`.
 * Sem isso, só veríamos os 30 primeiros e a nuvem marcaria o resto como
 * "faltando" → re-push espúrio.
 */
export async function listDeviceRoster(client: RosterClient): Promise<DeviceUser[]> {
  const all: DeviceUser[] = []
  let position = 0
  for (let guard = 0; guard < 10000; guard++) {
    const res: any = await client.searchUsers(undefined, position, PAGE)
    const search = res?.UserInfoSearch
    const list: any[] = search?.UserInfo ?? []
    for (const u of list) {
      all.push({ employeeNo: String(u.employeeNo), numOfFace: Number(u.numOfFace) || 0, numOfCard: Number(u.numOfCard) || 0 })
    }
    const total = Number(search?.totalMatches ?? all.length)
    position += list.length
    if (list.length === 0 || all.length >= total) break
  }
  return all
}

export interface ReconcileRunResult {
  terminals: number
  pushes: number
  removals: number
  directDeletes: number
}

/**
 * Um ciclo de reconciliação: para cada terminal, lista o roster → reporta →
 * deleta direto os órfãos (sem linha). Cadência própria (não roda a cada poll).
 */
export async function runReconcile(cfg: AgentConfig): Promise<ReconcileRunResult> {
  const terminals = await getTerminals(cfg)
  let pushes = 0, removals = 0, directDeletes = 0
  for (const t of terminals) {
    if (!t.password) continue
    const client = new HikvisionClient({ ipAddress: t.ipAddress, port: t.port, useHttps: t.useHttps, username: t.username, password: t.password })
    let roster: DeviceUser[]
    try {
      roster = await listDeviceRoster(client)
    } catch {
      continue // terminal inacessível agora; próximo ciclo tenta de novo
    }
    const r = await postReconcile(cfg, t.id, roster)
    pushes += r.pushesEnqueued
    removals += r.removalsEnqueued
    for (const emp of r.removeEmployeeNos) {
      try { await client.deleteUser(emp); directDeletes++ } catch { /* próximo ciclo reconcilia de novo */ }
    }
  }
  return { terminals: terminals.length, pushes, removals, directDeletes }
}
