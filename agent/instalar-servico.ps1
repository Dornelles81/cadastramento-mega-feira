# Instala o Mega Agente como SERVIÇO do Windows via NSSM.
# EXECUTAR COMO ADMINISTRADOR.
#
# Este arquivo é a FONTE versionada do instalador. A pasta do serviço
# (C:\MegaAgente) e o dist\ do build são cópias - ao mudar algo aqui, recopie.
#
# O que este script faz:
#   - registra o serviço apontando para mega-agente.exe
#   - inicia junto com a máquina (SERVICE_AUTO_START)
#   - reinicia sozinho se o processo cair, com throttle anti-loop
#   - grava stdout/stderr DIRETO EM ARQUIVO, com rotação (diária ou a cada 10 MB)
#
# LOG - por que direto em arquivo, sem `tee` nem pipe no meio:
#   Rodar o agente como `mega-agente.exe | tee agente.log` (ou qualquer pipe)
#   perde log. O processo do meio bufferiza em blocos e, se ele morrer antes do
#   flush - fechar a janela, matar o terminal -, as linhas que estavam no buffer
#   somem para sempre. Pior: o agente SOBREVIVE ao pipe morto e continua
#   escrevendo nos terminais sem deixar rastro nenhum. Foi exatamente o que
#   aconteceu em 17/08/2026: o agente rodou a noite inteira invisível, e a
#   remoção de um órfão não apareceu em log nenhum. O NSSM abaixo escreve nos
#   descritores do processo, sem intermediário - é o modo correto.
#
# Nada aqui apaga dados nem toca o terminal: só configura como o .exe é executado.

$ErrorActionPreference = 'Stop'

# ----------------------------------------------------------------- parâmetros
$ServiceName = 'MegaAgente'
$RaizServico = 'C:\MegaAgente'          # pasta do serviço (FORA do repositório)
$Exe         = Join-Path $RaizServico 'mega-agente.exe'
$PastaLogs   = Join-Path $RaizServico 'logs'
$Nssm        = Join-Path $RaizServico 'nssm.exe'

if (-not (New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script como Administrador.'
}
foreach ($p in @($Exe, $Nssm)) {
  if (-not (Test-Path $p)) { throw "Não encontrado: $p" }
}
if (-not (Test-Path (Join-Path $RaizServico 'agent.config.json'))) {
  throw "agent.config.json precisa estar em $RaizServico (ao lado do .exe)."
}
New-Item -ItemType Directory -Force -Path $PastaLogs | Out-Null

# --------------------------------------------------- remove instalação antiga
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Serviço $ServiceName já existe - removendo para reinstalar."
  & $Nssm stop $ServiceName confirm | Out-Null
  & $Nssm remove $ServiceName confirm | Out-Null
  Start-Sleep -Seconds 2
}

# ------------------------------------------------------------------- instala
& $Nssm install $ServiceName $Exe
& $Nssm set $ServiceName AppDirectory $RaizServico
& $Nssm set $ServiceName DisplayName 'Mega Agente (sync de terminais faciais)'
& $Nssm set $ServiceName Description 'Sincroniza participantes com os terminais Hikvision na LAN. Fala com a nuvem por token; nao possui MASTER_KEY nem acesso ao banco.'
& $Nssm set $ServiceName Start SERVICE_AUTO_START

# Conta: LocalSystem basta (só precisa de rede de saída; nada de compartilhamento).
& $Nssm set $ServiceName ObjectName LocalSystem

# --------------------------------------------------------- reinício automático
# Qualquer saída do processo (crash, exceção fatal, kill) => reinicia.
& $Nssm set $ServiceName AppExit Default Restart
& $Nssm set $ServiceName AppRestartDelay 5000      # espera 5s antes de subir de novo
# Se morrer em menos de 10s, NSSM considera "falha rápida" e espaça as tentativas,
# evitando loop de reinício que enche o log (ex.: token inválido).
& $Nssm set $ServiceName AppThrottle 10000

# Parada limpa: CTRL+C primeiro, só depois mata.
& $Nssm set $ServiceName AppStopMethodConsole 5000
& $Nssm set $ServiceName AppStopMethodWindow 5000
& $Nssm set $ServiceName AppStopMethodThreads 5000

# ------------------------------------------------------------- log + rotação
& $Nssm set $ServiceName AppStdout (Join-Path $PastaLogs 'agente.log')
& $Nssm set $ServiceName AppStderr (Join-Path $PastaLogs 'agente.log')
& $Nssm set $ServiceName AppStdoutCreationDisposition 4   # append, não truncar
& $Nssm set $ServiceName AppStderrCreationDisposition 4
& $Nssm set $ServiceName AppRotateFiles 1                 # liga rotação
& $Nssm set $ServiceName AppRotateOnline 1                # rotaciona sem parar o serviço
& $Nssm set $ServiceName AppRotateSeconds 86400           # ...a cada 24h
& $Nssm set $ServiceName AppRotateBytes 10485760          # ...ou a cada 10 MB, o que vier antes
# Carimbo de data/hora em cada linha: sem isso, log de 58 dias é ilegível.
#
# POR QUE O PACOTE LEVA UM PRE-RELEASE DO NSSM (2.24-101-g897c7ad, de 2017)
# e não o "estável" 2.24 (2014) - dois motivos, e o primeiro é o mais sério:
#
#   1. O próprio nssm.cc avisa, na página de download: "Users of Windows 10
#      Creators Update or newer should use prelease build 2.24-101 or any newer
#      build to avoid an issue with services failing to start." O PC do evento é
#      Win11, ou seja, dentro do escopo do aviso: com o 2.24 o SERVIÇO PODE NÃO
#      INICIAR. O contorno oficial (AppNoConsole=1) não serve aqui, porque o
#      agente é app de console e a parada limpa acima depende justamente do
#      console (AppStopMethodConsole).
#   2. AppTimestampLog não existe no 2.24 - conferido no próprio binário. Sem
#      ele o log fica sem hora, que depois do episódio de 17/08/2026 (agente
#      rodando invisível) é abrir mão da única coisa que torna o log utilizável.
#
# "Release" ali é só rótulo: o nssm não tem release estável desde 2014, então
# não existe a opção "nova e estável". Os dois binários são não-assinados. O
# 2.24-101 é o pre-release DESTACADO pelo site, com SHA1 conferido contra ele
# (ca2f6782a05af85facf9b620e047b01271edd11d).
#
# O if abaixo continua valendo: se alguém repuser um NSSM antigo na pasta, o
# aviso aparece em vez de o log ficar silenciosamente sem hora.
& $Nssm set $ServiceName AppTimestampLog 1
if ($LASTEXITCODE -ne 0) {
  Write-Warning ('Este NSSM não suporta AppTimestampLog: o log NÃO terá carimbo ' +
    'de data/hora. Use o build 2.24-101-g897c7ad (ou mais novo) do nssm.cc.')
}

# --------------------------------------------------------------------- sobe
& $Nssm start $ServiceName
Start-Sleep -Seconds 8

Write-Host ''
Write-Host '=== STATUS ==='
& $Nssm status $ServiceName
Get-Service -Name $ServiceName | Format-List Name, Status, StartType

Write-Host ''
Write-Host '=== PRIMEIRAS LINHAS DO LOG ==='
$log = Join-Path $PastaLogs 'agente.log'
# -Encoding UTF8 SEMPRE: o agente escreve UTF-8, o NSSM grava os bytes crus, e o
# Get-Content do PowerShell 5.1 assume CP1252 em arquivo sem BOM. Sem a flag,
# qualquer caractere nao-ASCII vindo de baixo (erro de biblioteca, mensagem do
# Node) sai como "Ã³rfÃ£o". As mensagens do agente ja sao ASCII puro de
# proposito (ver agent/log.ts) - a flag e a segunda camada, para o que nao
# controlamos.
if (Test-Path $log) { Get-Content $log -Tail 20 -Encoding UTF8 } else { Write-Host '(log ainda vazio)' }

Write-Host ''
Write-Host "Serviço instalado. Logs em: $PastaLogs"
Write-Host "Parar:     $Nssm stop $ServiceName"
Write-Host "Remover:   $Nssm remove $ServiceName confirm"
Write-Host ''
Write-Host '=== COMO SABER SE O AGENTE ESTÁ RODANDO ==='
Write-Host 'Verifique por PROCESSO/SERVIÇO, nunca por "tem uma janela aberta".'
Write-Host 'Janela fechada nao significa agente parado: o processo sobrevive ao'
Write-Host 'terminal que o iniciou e segue escrevendo nos terminais faciais.'
Write-Host ''
Write-Host ("  Get-Service {0}" -f $ServiceName)
Write-Host '  Get-CimInstance Win32_Process -Filter "Name=''mega-agente.exe''" | Select ProcessId, CreationDate'
Write-Host ("  Get-Content '{0}' -Tail 30 -Wait -Encoding UTF8   # log ao vivo" -f (Join-Path $PastaLogs 'agente.log'))
Write-Host ''
Write-Host 'Rodando fora do serviço (tsx/node, para depuração), o processo NAO aparece'
Write-Host 'como mega-agente.exe - procure por node.exe com agent/run.ts na linha de comando:'
Write-Host '  Get-CimInstance Win32_Process -Filter "Name=''node.exe''" | Where-Object { $_.CommandLine -match ''agent/run'' }'
