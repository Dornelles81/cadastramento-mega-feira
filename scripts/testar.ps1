# Roda um comando contra o BANCO DE TESTE (branch Neon "testes").
#
# Uso:
#   .\scripts\testar.ps1 scripts\test-reconcile.ts        # roda um teste
#   .\scripts\testar.ps1 -Comando 'npx prisma migrate deploy'
#
# O que faz: le o .env.test.local e injeta DATABASE_URL / DIRECT_URL /
# BANCOS_DE_TESTE no AMBIENTE deste processo, entao executa o comando. Como
# `dotenv.config()` NAO sobrescreve variavel de ambiente existente, o
# .env.local continua fornecendo todo o resto (MASTER_KEY etc.) e as tres
# variaveis daqui vencem. E o mesmo mecanismo descrito em scripts/_guard.ts.
#
# Por que um runner em vez de "exporte as variaveis na mao": porque colar
# connection string no terminal a cada teste e como a trava acabou existindo -
# uma hora alguem cola a de producao. Aqui o alvo esta num arquivo so, fora do
# Git, e o script CONFERE o alvo antes de executar qualquer coisa.

param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]] $Script,

  [string] $Comando
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $raiz '.env.test.local'
if (-not (Test-Path $envFile)) {
  throw ".env.test.local nao encontrado em $raiz. Sem ele nao ha banco de teste configurado."
}

# ------------------------------------------------------------------ carrega
$carregadas = @()
foreach ($linha in Get-Content $envFile) {
  $t = $linha.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $nome = $t.Substring(0, $i).Trim()
  $valor = $t.Substring($i + 1).Trim().Trim("'", '"')
  Set-Item -Path "env:$nome" -Value $valor
  $carregadas += $nome
}

# ------------------------------------------------------- confere o alvo
# Mesma logica do _guard, ANTES de rodar: se o alvo estiver errado, a falha
# acontece aqui, com mensagem clara, e nao no meio de um teste que ja escreveu.
function HostDe([string] $url) {
  if ($url -match '@([^/:?]+)') { return $matches[1].ToLower() }
  return $null
}
$hostDb = HostDe $env:DATABASE_URL
$hostDirect = HostDe $env:DIRECT_URL
$PRODUCAO = 'ep-wandering-waterfall-acykvygu'

foreach ($par in @(@('DATABASE_URL', $hostDb), @('DIRECT_URL', $hostDirect))) {
  $nome = $par[0]; $h = $par[1]
  if (-not $h) { throw "$nome ausente ou ilegivel no .env.test.local" }
  if ($h -like "*$PRODUCAO*") { throw "$nome aponta para PRODUCAO ($h). Abortado." }
  if ($h -notlike "*$($env:BANCOS_DE_TESTE)*") {
    throw "$nome ($h) nao casa com BANCOS_DE_TESTE ($($env:BANCOS_DE_TESTE)). A trava recusaria."
  }
}

Write-Host ''
Write-Host '=== BANCO DE TESTE ===' -ForegroundColor Cyan
Write-Host ("  variaveis  : " + ($carregadas -join ', '))
Write-Host ("  DATABASE_URL -> " + $hostDb)
Write-Host ("  DIRECT_URL   -> " + $hostDirect)
Write-Host ''

# ------------------------------------------------------------------ executa
if ($Comando) {
  Write-Host "> $Comando" -ForegroundColor DarkGray
  Invoke-Expression $Comando
} elseif ($Script -and $Script.Count -gt 0) {
  # tsx.cmd, nao "tsx": no Windows o arquivo sem extensao e o shell script Unix,
  # e chamar por caminho literal (& "...\tsx") nao passa pelo PATHEXT - o
  # processo termina sem rodar nada e SEM erro, que foi o que aconteceu aqui.
  $tsx = Join-Path $raiz 'node_modules\.bin\tsx.cmd'
  if (-not (Test-Path $tsx)) { throw "tsx.cmd nao encontrado em $tsx" }
  Write-Host ("> tsx " + ($Script -join ' ')) -ForegroundColor DarkGray
  & $tsx @Script
} else {
  throw 'Informe um script (.\scripts\testar.ps1 scripts\test-x.ts) ou -Comando ''...'''
}

exit $LASTEXITCODE
