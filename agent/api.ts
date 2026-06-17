/**
 * Cliente HTTP do agente para os endpoints da nuvem (/api/agent/*). Só fala por
 * token Bearer; nunca toca Prisma nem credencial de banco.
 */
import type { AgentConfig } from './config'

export interface TerminalCred {
  id: string
  ipAddress: string
  port: number
  useHttps: boolean
  username: string
  password: string | null // decriptada na nuvem; null se a nuvem não tinha senha
}
export interface PushItem {
  syncId: string
  terminalId: string
  employeeNo: string
  name: string
  cardNumber: string | null
  validBegin: string
  validEnd: string
  needFace: boolean
  needCard: boolean
  face: string | null // data URL já decriptada na nuvem
}
export interface RemovalItem {
  syncId: string
  terminalId: string
  employeeNo: string
}
export interface WorkResponse {
  push: PushItem[]
  removals: RemovalItem[]
}
export interface Ack {
  syncId: string
  kind: 'face' | 'card' | 'removal'
  status: 'success' | 'failed'
  error?: string
}
export interface HeartbeatItem {
  terminalId: string
  online: boolean
  error?: string
}

async function req(cfg: AgentConfig, method: string, p: string, body?: any) {
  const res = await fetch(cfg.baseUrl + p, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 401) throw new Error('401 — token inválido ou revogado (peça um token novo ao admin)')
  let json: any = null
  try { json = await res.json() } catch { /* sem corpo */ }
  return { status: res.status, json }
}

export async function getTerminals(cfg: AgentConfig): Promise<TerminalCred[]> {
  const { json } = await req(cfg, 'GET', '/api/agent/terminals')
  return (json?.terminals ?? []) as TerminalCred[]
}

export async function getWork(cfg: AgentConfig): Promise<WorkResponse> {
  const { json } = await req(cfg, 'GET', `/api/agent/work?limit=${cfg.workLimit}`)
  return { push: json?.push ?? [], removals: json?.removals ?? [] }
}

export async function postAck(cfg: AgentConfig, acks: Ack[]): Promise<void> {
  if (acks.length === 0) return
  await req(cfg, 'POST', '/api/agent/ack', { acks })
}

export async function postHeartbeat(cfg: AgentConfig, terminals: HeartbeatItem[]): Promise<void> {
  if (terminals.length === 0) return
  await req(cfg, 'POST', '/api/agent/heartbeat', { terminals })
}
