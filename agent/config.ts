/**
 * Config do agente local (F3). O operador preenche SÓ o token (e, se quiser,
 * a baseUrl — já vem apontada p/ produção). O IP/credencial do terminal NÃO
 * ficam aqui: vêm da nuvem em /api/agent/terminals (decriptados lá), keyados
 * pelo escopo do token. O agente NUNCA recebe MASTER_KEY nem connection string.
 *
 * Ordem de leitura: variáveis de ambiente > agent.config.json (ao lado do .exe).
 */
import fs from 'fs'
import path from 'path'

export interface AgentConfig {
  baseUrl: string
  token: string
  pollMs: number
  workLimit: number
  reconcileMs: number
}

function readConfigFile(): Partial<AgentConfig> {
  const candidates = [
    process.env.AGENT_CONFIG,
    path.join(process.cwd(), 'agent.config.json'),
    // ao lado do executável empacotado (.exe)
    process.execPath ? path.join(path.dirname(process.execPath), 'agent.config.json') : undefined
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch { /* arquivo ausente/ inválido: tenta o próximo */ }
  }
  return {}
}

export function loadConfig(): AgentConfig {
  const file = readConfigFile()
  const baseUrl = (process.env.AGENT_BASE_URL || file.baseUrl || 'https://megacredenciamento.com.br').replace(/\/+$/, '')
  const token = process.env.AGENT_TOKEN || file.token || ''
  const pollMs = Number(process.env.AGENT_POLL_MS || file.pollMs || 5000)
  const workLimit = Number(process.env.AGENT_WORK_LIMIT || file.workLimit || 50)
  // Reconciliação roda em cadência própria (não a cada poll): lista o roster do
  // device, mais pesado. Default 60s.
  const reconcileMs = Number(process.env.AGENT_RECONCILE_MS || file.reconcileMs || 60000)
  if (!token) {
    throw new Error('Token ausente. Cole o token em agent.config.json (campo "token") ou defina AGENT_TOKEN.')
  }
  return { baseUrl, token, pollMs, workLimit, reconcileMs }
}
