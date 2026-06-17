/**
 * Entrypoint do agente (.exe). Uso:
 *   mega-agente.exe              → loop contínuo (sync automático)
 *   mega-agente.exe --dry-run    → mostra o que faria, SEM escrever no device
 *
 * Config em agent.config.json ao lado do .exe (só o token é obrigatório).
 */
import { loadConfig } from './config'
import { runOnce, mainLoop } from './agent'

async function main() {
  if (process.argv.includes('--dry-run')) {
    const cfg = loadConfig()
    console.log('[DRY-RUN] sem escrita no device. Plano do /work atual:')
    const r = await runOnce(cfg, { dryRun: true })
    if (r.planned.length === 0) console.log('  (nada pendente)')
    else r.planned.forEach(p => console.log('  - ' + p))
    return
  }
  await mainLoop()
}

main().catch((e: any) => {
  console.error('[agente] erro fatal:', e?.message ?? e)
  process.exit(1)
})
