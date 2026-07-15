/**
 * Sonda de conexões: amostra pg_stat_activity DURANTE a carga.
 *
 * Usa DIRECT_URL (endpoint sem -pooler) de propósito: a sonda não pode consumir
 * slot do pooler que estamos medindo. Como o PgBouncer do Neon multiplexa em
 * modo transaction, os backends vistos aqui são as conexões de SERVIDOR
 * realmente ocupadas — é esse número que satura, não o de clientes.
 */
import { PrismaClient } from '@prisma/client'

export interface Sample {
  t: number
  total: number
  active: number
  idleInTx: number
  idle: number
  waitingOnLock: number
}

interface Row {
  state: string | null
  wait_event_type: string | null
  n: bigint
}

export class ConnProbe {
  private client: PrismaClient
  private timer: NodeJS.Timeout | null = null
  readonly samples: Sample[] = []

  constructor(directUrl: string) {
    this.client = new PrismaClient({
      datasources: { db: { url: directUrl } },
      log: ['error'],
    })
  }

  async start(intervalMs = 250): Promise<void> {
    await this.client.$connect()
    const tick = async () => {
      try {
        const rows = await this.client.$queryRaw<Row[]>`
          SELECT state, wait_event_type, count(*) AS n
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND backend_type = 'client backend'
          GROUP BY state, wait_event_type
        `
        const s: Sample = { t: Date.now(), total: 0, active: 0, idleInTx: 0, idle: 0, waitingOnLock: 0 }
        for (const r of rows) {
          const n = Number(r.n)
          s.total += n
          if (r.state === 'active') s.active += n
          else if (r.state === 'idle in transaction') s.idleInTx += n
          else if (r.state === 'idle') s.idle += n
          if (r.wait_event_type === 'Lock') s.waitingOnLock += n
        }
        this.samples.push(s)
      } catch {
        /* a sonda nunca derruba o teste */
      }
    }
    await tick()
    this.timer = setInterval(tick, intervalMs)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await this.client.$disconnect()
  }

  /** Limite de backends do compute — o teto real da saturação. */
  async maxConnections(): Promise<number> {
    const r = await this.client.$queryRaw<{ setting: string }[]>`
      SELECT setting FROM pg_settings WHERE name = 'max_connections'
    `
    return Number(r[0]?.setting ?? 0)
  }

  summary() {
    const peak = (k: keyof Sample) =>
      this.samples.reduce((m, s) => Math.max(m, s[k] as number), 0)
    return {
      samples: this.samples.length,
      peakTotal: peak('total'),
      peakActive: peak('active'),
      peakIdleInTx: peak('idleInTx'),
      peakWaitingOnLock: peak('waitingOnLock'),
    }
  }
}
