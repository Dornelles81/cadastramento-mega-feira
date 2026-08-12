/**
 * Entrypoint do agente (.exe). Uso:
 *   mega-agente.exe                 → loop contínuo (sync automático)
 *   mega-agente.exe --dry-run       → mostra o que faria, SEM escrever no device
 *   mega-agente.exe --no-reconcile  → loop sem a reconciliação periódica
 *
 * O `--no-reconcile` é para operação ASSISTIDA: o agente aplica só o que já
 * está enfileirado e não varre o roster do device para enfileirar correções.
 * Ele AINDA ESCREVE no device se houver fila — quem não pode escrever nada
 * usa `--dry-run`.
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
  await mainLoop({ reconcile: !process.argv.includes('--no-reconcile') })
}

main().catch((e: any) => {
  console.error('[agente] erro fatal:', e?.message ?? e)
  process.exit(1)
})
