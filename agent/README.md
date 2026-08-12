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

## Empacotamento como .exe (recomendado: @yao-pkg/pkg)

`vercel/pkg` foi arquivado; o fork **`@yao-pkg/pkg`** é mantido e é a opção mais
robusta hoje para um único `.exe` no Windows (Node SEA oficial é alternativa, mas
com mais passos: bundle + postject). Fluxo:

```bash
# 1) bundle do agente num único arquivo CJS (resolve lib/hikvision + axios)
npx esbuild agent/run.ts --bundle --platform=node --target=node18 --outfile=dist/agent.cjs

# 2) empacota em .exe Windows x64
npx @yao-pkg/pkg dist/agent.cjs --targets node18-win-x64 --output mega-agente.exe
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
