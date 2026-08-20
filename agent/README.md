# Mega Agente (sync local dos terminais) — F3

Programa que roda **no PC do evento**, na mesma rede dos terminais Hikvision.
Em loop: pega o trabalho pendente da nuvem (`/api/agent/work`), escreve nos
terminais por ISAPI (addUser → uploadFace → registerCard / deleteUser) e confirma
(`/api/agent/ack`). É o consumidor do fan-out da F2.

## Segurança (modelo travado)
- O agente recebe a **credencial do terminal já decriptada** da nuvem
  (`/api/agent/terminals`) e a **face já em claro** (`/api/agent/work`).
- **Nunca** tem a `MASTER_KEY` nem a connection string do banco. Só fala por
  **token de escopo** (revogável; um por evento — kill switch no admin).
- O IP/credencial do terminal **não ficam no PC**: vêm da nuvem, keyados pelo
  token. O admin cadastra o terminal uma vez; trocou de IP, troca lá — o agente
  re-busca. **O operador não digita IP nem senha de device.**

## Configuração (só o token)
Ao lado do executável, um arquivo `agent.config.json` (copie de
`agent.config.example.json`):

```json
{
  "baseUrl": "https://megacredenciamento.com.br",
  "token": "COLE_AQUI_O_TOKEN_DO_EVENTO",
  "pollMs": 5000
}
```

O operador **cola o token** (gerado no admin para aquele evento) e pronto. Sem
recompilar por evento. (Dá pra usar env `AGENT_TOKEN`/`AGENT_BASE_URL` no lugar.)

## Uso
```
mega-agente.exe                 # loop contínuo (sync automático)
mega-agente.exe --dry-run       # mostra o que faria, SEM escrever no device
mega-agente.exe --no-reconcile  # loop sem a reconciliação periódica
```
O `--dry-run` é a checagem segura do dia: confere conectividade e o que está
pendente sem tocar nos terminais.

### ⚠️ Observar o agente SEM risco de escrita

**Nunca use `mainLoop` (o modo padrão) para "só ver se o agente está vivo".**
Ele aplica no device tudo que estiver na fila, e a reconciliação enfileira
sozinha ao varrer o roster. Para observação use um destes:

| Objetivo | Como | Escreve no device? |
|---|---|---|
| Ver conectividade e o que está pendente | `--dry-run` | **não** |
| Um único ciclo real (heartbeat + fila) | `runOnce(cfg)` direto | só se a fila tiver itens |
| Loop sem varredura de roster | `--no-reconcile` | só se a fila tiver itens |

`--no-reconcile` **não** é modo somente-leitura: ele apenas impede que a
reconciliação crie trabalho novo. Se já houver fila, o agente aplica. Quem não
pode escrever nada usa `--dry-run`.

Para um ciclo único de verdade (com heartbeat, que o `--dry-run` pula), chame
`runOnce(cfg)` de um script — não o `mainLoop`:

```ts
import { loadConfig } from './agent/config'
import { runOnce } from './agent/agent'
await runOnce(loadConfig())   // 1 ciclo: terminals + heartbeat + work + ack
```

> **Cadência do primeiro reconcile.** `lastReconcile` inicia em `Date.now()`, de
> modo que a primeira reconciliação só ocorre após um `reconcileMs` completo.
> Antes iniciava em `0`, e como a conta é `Date.now() - lastReconcile`, o
> primeiro ciclo sempre disparava a varredura — ligar o agente num evento com
> roster cheio sincronizava tudo na hora, sem aviso.

## 📄 Log: direto em arquivo, nunca por pipe

**Não rode `mega-agente.exe | tee agente.log`** — nem qualquer variante com pipe.
Use redirecionamento simples, ou o serviço (que já faz isso via NSSM):

```powershell
# certo
mega-agente.exe >> C:\MegaAgente\logs\agente.log 2>&1

# errado — perde log
mega-agente.exe | tee C:\MegaAgente\logs\agente.log
```

O processo do meio bufferiza em blocos e, se morrer antes do flush (fechar a
janela, matar o terminal), as linhas que estavam no buffer **somem para sempre**.
E o agente **sobrevive ao pipe morto**: continua rodando e escrevendo nos
terminais, agora sem deixar rastro algum.

> Aconteceu em 17/08/2026 na bancada: o agente rodou a noite inteira invisível
> depois que a janela foi encerrada. A remoção de um usuário órfão não apareceu
> em log nenhum — e a ausência de linha foi interpretada, erradamente, como bug
> no código da reconciliação. O código estava certo; o cano é que estava roto.

### Ler o log: sempre com `-Encoding UTF8`

```powershell
Get-Content C:\MegaAgente\logs\agente.log -Tail 30 -Wait -Encoding UTF8
```

Sem a flag o PowerShell 5.1 lê arquivo sem BOM como CP1252 e qualquer byte
não-ASCII vira mojibake — na primeira subida do serviço no mini PC (20/08/2026),
`iniciado · base=...` apareceu como `iniciado Â· base=...`. O arquivo estava
certo; a leitura é que não.

Por isso as mensagens do agente são **ASCII puro** (ver `agent/log.ts`): sem
acento, sem `·`, sem travessão — inclusive nas mensagens de `new Error(...)`, que
viram linha de log. As duas coisas são camadas do mesmo cuidado: o ASCII faz o
log sair certo mesmo sem a flag, e a flag cobre o que vem de baixo (erro de
biblioteca, mensagem do Node) e que não controlamos.

## ✅ Verificar se o agente está rodando — por PROCESSO, não por janela

Janela fechada **não** significa agente parado. Matar o terminal (ou o shell que
o iniciou) mata o embrulho, não o processo do agente.

```powershell
# como serviço
Get-Service MegaAgente
Get-CimInstance Win32_Process -Filter "Name='mega-agente.exe'" | Select ProcessId, CreationDate

# rodando via tsx/node (depuração): o nome do processo é node.exe
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'agent/run' } |
  Select ProcessId, CreationDate, CommandLine

# parar de verdade
Stop-Process -Id <PID> -Force        # avulso
& nssm stop MegaAgente               # serviço
```

Faça essa verificação **antes de qualquer teste de bancada**: um agente esquecido
reconcilia a cada 60s e apaga o órfão de teste antes de você conseguir observá-lo.

## 🚚 Instalação no PC do evento — ordem obrigatória

**Passo 1, SEMPRE: gerar o `.exe` a partir do código mais recente.** Nunca
reaproveitar binário antigo — nem o que está em `dist/`, nem o do pen drive da
instalação anterior.

```bash
git pull   # o código do evento é o do main, não o do seu disco

npx esbuild agent/run.ts --bundle --platform=node --target=node18 --outfile=dist/agent.cjs
npx @yao-pkg/pkg dist/agent.cjs --targets node22-win-x64 --output dist/mega-agente.exe
```

> **Não troque o alvo do `pkg` de volta para `node18-win-x64`.** O `pkg` 6.22.0
> não tem mais esse binário base no cache remoto: responde `404 Not Found —
> node-v18.20.8-win-x64`, cai para compilar o Node do fonte e morre no Windows
> com `spawnSync patch ENOENT` (não existe `patch`). O `--target=node18` do
> **esbuild** é outra coisa (alvo de sintaxe do bundle) e continua correto.
> Verificado em 19/08/2026, ao montar o mini PC do evento.

(Os dois comandos são o build completo; `docs/agente-exe-build.md` descreve o
atalho opcional `npm run agent:exe`, que **ainda não está** no `package.json`.)

O `.exe` é um **retrato congelado** do agente no instante do build. Correções
entregues depois dele — inclusive as de log e de sincronismo — só chegam ao
terminal quando o binário é regerado. Um `.exe` de semanas atrás roda sem
reclamar e sem avisar que está velho: não há checagem de versão contra a nuvem.

Por isso o build **não** deve ser feito "com antecedência, para adiantar". Gere
no dia da instalação, com o PC do evento já em mãos.

Ordem completa:

1. `git pull` + os dois comandos de build acima → `dist/mega-agente.exe` **recém-gerado**
2. copiar para a pasta do serviço (`C:\MegaAgente`): `mega-agente.exe`,
   `agent.config.json` (com o token do evento), `nssm.exe` e
   `instalar-servico.ps1`
3. executar `instalar-servico.ps1` **como Administrador**
4. conferir pelo log e pelo processo (seções acima) que subiu de fato
5. `--dry-run` uma vez antes de liberar, para validar token e conectividade
   sem escrever nos terminais

### Instalação como serviço do Windows

`agent/instalar-servico.ps1` (fonte versionada) instala via NSSM, com reinício
automático, log em arquivo e rotação diária/10 MB. Copie-o junto do `.exe` para a
pasta do serviço e execute **como Administrador**. A cópia em `dist/` é artefato
de build (`/dist` é gitignored) — a fonte é a de `agent/`.

## Empacotamento como .exe (recomendado: @yao-pkg/pkg)

`vercel/pkg` foi arquivado; o fork **`@yao-pkg/pkg`** é mantido e é a opção mais
robusta hoje para um único `.exe` no Windows (Node SEA oficial é alternativa, mas
com mais passos: bundle + postject). Fluxo:

```bash
# 1) bundle do agente num único arquivo CJS (resolve lib/hikvision + axios)
npx esbuild agent/run.ts --bundle --platform=node --target=node18 --outfile=dist/agent.cjs

# 2) empacota em .exe Windows x64 (alvo node22: o node18 não existe mais no
#    cache remoto do pkg — ver aviso na seção de instalação)
npx @yao-pkg/pkg dist/agent.cjs --targets node22-win-x64 --output mega-agente.exe
```

Distribuir a pasta com: `mega-agente.exe` + `agent.config.json`.

## SmartScreen / assinatura — o que o operador vai ver (e como não travar)

O `.exe` **não é assinado** (assinatura de código é cert pago: OV ~US$200–400/ano;
EV mais caro). Sem assinar, o Windows mostra o **SmartScreen** — a tela azul
*"O Windows protegeu o seu computador"* / *"Editor desconhecido"* — **apenas para
arquivos com a "marca da web" (Mark of the Web)**, ou seja, baixados por
navegador/anexo de e-mail.

Como **não travar no dia do evento** (sem assinatura paga):

1. **Distribua por pen drive / pasta de rede, não por download de navegador.**
   Arquivos copiados localmente normalmente **não** recebem a marca da web → o
   SmartScreen nem aparece.
2. **Se aparecer**, é 1 clique: **"Mais informações" → "Executar assim mesmo"**.
   Só na primeira vez naquela máquina.
3. **Pré-desbloquear** antes de entregar: botão direito no `.exe` →
   **Propriedades** → marque **"Desbloquear"** → OK. Remove a marca da web e o
   alerta some.
4. (Opcional, longo prazo) Comprar um certificado de code signing elimina o aviso
   de vez. EV constrói reputação SmartScreen imediata; OV leva um tempo. Não é
   necessário para operar — só cosmético/confiança.

> Recomendo deixar uma instrução de 1 página impressa no PC do evento com os
> passos 2 e 3, para o operador não hesitar.

## Teste (sem device)
`npx tsx scripts/test-agent-f3.ts` — valida o dry-run do plano e o backoff/retry
do `/work`. A escrita real no terminal é o **teste de bancada** (com aprovação).
