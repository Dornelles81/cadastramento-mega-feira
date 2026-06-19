# Mega Agente — build do `.exe` (guia para quando houver Windows)

> **Estado:** o `.exe` **NÃO** está construído. Este guia deixa tudo pronto para
> empacotar e validar **numa máquina Windows**, quando ela existir. O `.exe` só é
> necessário para o sync dos terminais (outubro) — **não** é preciso para a coleta
> de faciais que a Expofest já pode iniciar. Não construa às cegas no Linux: o
> `pkg` até gera um binário Windows a partir do Linux, mas a **validação** (rodar,
> SmartScreen, escrita real no terminal) exige Windows na rede dos terminais.

O código-fonte do agente está em [`agent/`](../agent/) e já é funcional via `tsx`
(provado no teste de bancada F3/F4/F5). O empacotamento `.exe` é só conveniência
de distribuição: "clicar e rodar" sem instalar Node no PC do evento.

---

## 0. Por que `.exe` (decisão D)

Qualquer pessoa da equipe liga o agente sem conhecimento técnico — só clicar.
Sem `.exe`, seria preciso instalar Node + rodar `tsx` no PC do evento. Ver
[`docs/fase2-sync-plano.md`](./fase2-sync-plano.md) (decisão D) e
[`agent/README.md`](../agent/README.md).

---

## 1. Pré-requisitos (na máquina Windows)

- **Windows 10/11 x64**, na **mesma rede** dos terminais Hikvision (para o teste real).
- **Node.js LTS** instalado (18, 20 ou 22) — só para **rodar o empacotador**; o
  `.exe` final embute o próprio runtime e **não** depende de Node instalado no PC
  do evento. Baixe em https://nodejs.org (instalador .msi).
- **O código do agente.** Duas opções:
  - clonar o repositório (`git clone …`) e rodar os comandos na raiz do projeto; **ou**
  - copiar a pasta `agent/` + a pasta `lib/hikvision/` + o `package.json`/`node_modules`
    (mais frágil). **Recomendado: clonar o repositório** e empacotar a partir da raiz.
- **Internet na primeira vez** (o `npx` baixa `esbuild` e `@yao-pkg/pkg`).

---

## 2. Comando de build (copiar e colar, na raiz do projeto)

São **dois passos**: (a) juntar o agente num único arquivo JS; (b) empacotar em `.exe`.

```bash
# (a) bundle: resolve agent/run.ts + lib/hikvision/client + axios num único CJS
npx esbuild agent/run.ts --bundle --platform=node --target=node18 --outfile=dist/agent.cjs

# (b) empacota em .exe Windows x64 (runtime Node embutido)
npx @yao-pkg/pkg dist/agent.cjs --targets node18-win-x64 --output dist/mega-agente.exe
```

Notas:
- **`@yao-pkg/pkg`** é o fork mantido do `vercel/pkg` (este foi arquivado). É a
  via mais robusta hoje para um único `.exe`. Alternativa oficial: Node SEA
  (Single Executable Applications) — funciona, mas exige mais passos (bundle +
  `postject`); só vale se o `pkg` der problema.
- **Alvo `node18-win-x64`:** estável e testado. Pode usar `node20-win-x64` ou
  `node22-win-x64` se preferir runtime mais novo — o alvo do `pkg` é independente
  da versão do Node que você tem instalado para empacotar.
- **Sem dependências nativas:** o agente só usa `axios` (JS puro) e `crypto`/`fs`/
  `path` (builtins do Node). Por isso o `pkg` empacota sem `.node` avulso. Se um dia
  entrar uma dep nativa, ela teria que ir como arquivo solto ao lado do `.exe`.

### (Opcional) deixar como atalho `npm`
Se quiser rodar `npm run agent:exe` em vez de decorar os dois comandos, adicione
ao `"scripts"` do `package.json` (faça isso **na máquina Windows**, num commit
próprio, para não misturar com outro WIP):
```json
"agent:bundle": "esbuild agent/run.ts --bundle --platform=node --target=node18 --outfile=dist/agent.cjs",
"agent:exe": "npm run agent:bundle && pkg dist/agent.cjs --targets node18-win-x64 --output dist/mega-agente.exe"
```
(exige `npm i -D esbuild @yao-pkg/pkg`).

---

## 3. Passo a passo: "quando tiver o Windows, rode X, copie Y, teste Z"

1. **Instale o Node LTS** no Windows e **clone o repositório** (ou puxe `git pull`).
2. **Rode o build** (seção 2) na raiz do projeto. Saída esperada: `dist/mega-agente.exe`
   (~40–60 MB — normal, embute o runtime Node).
3. **Monte a pasta de distribuição** (ver seção 4): `mega-agente.exe` +
   `agent.config.json` com o **token do evento** (gerado no admin).
4. **Gere o token** no admin para o evento real (escopo por evento, revogável) e
   **cole** em `agent.config.json` (campo `"token"`).
5. **Teste Z — em camadas, sem arriscar o device primeiro:**
   - **5a. Dry-run (não escreve no terminal):**
     ```
     mega-agente.exe --dry-run
     ```
     Confere conectividade com a nuvem e **lista o que faria**. Se imprimir o plano
     (ou "nada pendente") sem erro de token/rede, a base está ok.
   - **5b. Sync real (escreve no terminal):** com um cadastro de teste **aprovado**
     e elegível, rode sem flag:
     ```
     mega-agente.exe
     ```
     O agente entra em loop, escreve no terminal (addUser → uploadFace →
     registerCard) e a linha de sync vira `synced`. Confirme no terminal que a
     pessoa é reconhecida e a porta abre. **Este é o teste de bancada** — faça com
     dado de teste e expurgue depois (ver memória `esperar-ok-antes-de-limpar`).
6. **Valide reconciliação (opcional, cobre drift):** deixe o agente rodando e
   confira que ele lista o roster do device e corrige divergências (F4). Cadência
   padrão 60s (`reconcileMs`).

> ⚠️ **Antes do teste real:** o terminal precisa de IP fixo, hora certa (NTP) e
> a senha forte trocada — ver [`FOLLOWUPS.md`](../FOLLOWUPS.md) › PRÉ-EVENTO.

---

## 4. Pasta de distribuição (o que entregar no PC do evento)

```
Mega-Agente/
├── mega-agente.exe          ← gerado no build
└── agent.config.json        ← copie de agent/agent.config.example.json e cole o token
```

`agent.config.json` mínimo:
```json
{
  "baseUrl": "https://megacredenciamento.com.br",
  "token": "COLE_AQUI_O_TOKEN_DO_EVENTO",
  "pollMs": 5000
}
```

- **Só o token é obrigatório** (a `baseUrl` já aponta para produção por padrão).
- O **IP e a senha do terminal NÃO ficam aqui** — vêm da nuvem (`/api/agent/terminals`),
  decriptados lá, keyados pelo escopo do token. O operador **não digita IP nem
  senha de device**. Trocou o IP do terminal? Atualize no admin; o agente re-busca.
- O agente **nunca** recebe `MASTER_KEY` nem a connection string do banco. Token
  revogável = kill switch no admin.

---

## 5. Folha do operador (1 página — imprimir e deixar no PC do evento)

> **MEGA AGENTE — como ligar o sync dos terminais**
>
> 1. Abra a pasta **`Mega-Agente`**.
> 2. Dê **duplo clique** em **`mega-agente.exe`**.
> 3. Vai abrir uma janela preta (terminal) que fica escrevendo linhas — **isso é
>    normal, é o agente trabalhando.** Deixe a janela **aberta** durante o evento.
> 4. Para **parar**, feche a janela.
>
> **Se aparecer uma tela azul "O Windows protegeu o seu computador":**
> - Clique em **"Mais informações"**.
> - Clique em **"Executar assim mesmo"**.
> - Só acontece **na primeira vez** naquela máquina. É esperado (o programa é
>   nosso, mas não tem assinatura paga).
>
> **Se quiser conferir sem ligar de verdade:** abra o Prompt de Comando na pasta e
> rode `mega-agente.exe --dry-run` — ele só mostra o que faria, sem mexer nos
> terminais.
>
> **Problema?** Token vencido/errado dá erro logo no início. Gere um novo token no
> admin e cole no `agent.config.json`.

---

## 6. SmartScreen / assinatura — detalhes (para quem prepara a entrega)

O `.exe` **não é assinado** (certificado de code signing é pago: OV ~US$200–400/ano;
EV mais caro). Sem assinatura, o **SmartScreen** ("Editor desconhecido") aparece
**apenas para arquivos com a "marca da web" (Mark of the Web)** — ou seja, baixados
por navegador ou anexo de e-mail. Como evitar o atrito no dia:

1. **Distribua por pen drive / pasta de rede, não por download de navegador.**
   Arquivos copiados localmente normalmente **não** recebem a marca da web → o
   SmartScreen nem aparece.
2. **Se aparecer:** "Mais informações" → "Executar assim mesmo" (1 clique, 1ª vez).
3. **Pré-desbloquear** antes de entregar: clique direito no `.exe` → **Propriedades**
   → marque **"Desbloquear"** → OK. Remove a marca da web; o alerta some.
4. **(Opcional, longo prazo)** Comprar certificado de code signing elimina o aviso
   de vez (EV constrói reputação SmartScreen imediata; OV leva um tempo). **Não é
   necessário para operar** — é cosmético/confiança.

---

## 7. Validação sem device (já dá pra rodar hoje, no Linux)

Independente do `.exe`, a lógica do agente é testável sem hardware:
```
npx tsx scripts/test-agent-f3.ts      # dry-run do plano + backoff/retry do /work
npx tsx scripts/test-reconcile.ts     # diff de reconciliação (F4)
npx tsx scripts/test-faceversion.ts   # versão de face (F5)
```
A escrita real no terminal é o **teste de bancada** (seção 3, passo 5b), com
aprovação e expurgo do dado de teste depois.

---

## 8. Resumo do "go" de outubro (sequência)

1. Pré-evento: IP fixo + NTP + senha forte do terminal + usuários OPERATOR
   ([`FOLLOWUPS.md`](../FOLLOWUPS.md)).
2. Cadastrar o(s) Terminal(is) no admin (IP + senha, criptografada em repouso).
3. Build do `.exe` (seção 2) na máquina Windows.
4. Gerar token do evento → `agent.config.json`.
5. `--dry-run` → sync real → confirmar reconhecimento/porta (seção 3).
6. Deixar a folha do operador (seção 5) impressa no PC.
