# Arquitetura: Núcleo compartilhado + Modos de acesso

> **Status:** desenho para revisão (2026-06-17). **NÃO é implementação.** Nenhuma
> mudança de código é proposta para hoje além do necessário quando a Fase 2 for
> construída. O objetivo é **não fechar portas** para os modos futuros **sem
> construí-los nem superdimensionar**.

---

## 0. TL;DR

- O **motor já é genérico**: biometria, validação de qualidade de face, ISAPI
  (addUser/uploadFace/registerCard/deleteUser/openDoor), criptografia,
  auth/segurança e expurgo **não sabem o que é "evento"** — são reaproveitáveis
  como estão.
- O que é específico de evento mora em **política de negócio** (validade,
  retenção, elegibilidade, categoria da pessoa) — hoje implícita e única.
- A jogada de baixo custo: **nomear e isolar essa política como um ponto de
  extensão ("modo")**, mantendo o motor intocado. Hoje existe **um modo só
  (EVENTO)**; o desenho deixa o **encaixe** para PERMANENTE (escola/condomínio)
  sem construí-lo.
- **Quase nada muda no código hoje.** As únicas decisões com efeito prático são
  de **enquadramento da Fase 2** (escrever o sync em termos de "contexto/roster"
  e derivar a validade de uma política, não de uma constante). Nenhuma tabela
  nova, nenhum campo novo, nenhum enum rígido agora.

---

## 1. Contexto e objetivo

O sistema nasceu como **credenciamento de eventos**: população **efêmera**, que
é cadastrada, recebe credencial (face + card/QR), acessa por alguns dias e é
**expurgada no fim** (LGPD). Isso funciona e está validado ponta a ponta
(cadastro → gate de face → push ISAPI → terminal reconhece e abre a porta).

A evolução pretendida é virar uma **plataforma de controle de acesso
multi-modo**:

| Modo | População | Validade | Estado | Retenção | Exemplos |
|---|---|---|---|---|---|
| **EVENTO** (hoje) | efêmera | curtíssima (dias) | pending/approved/rejected | **expurga no fim** | feiras, congressos |
| **ACESSO PERMANENTE** (futuro) | estável, com papéis | longa, renovável | suspenso/transferido/inadimplente/temporário | **mantém e atualiza** | escola, condomínio, … |

**Princípio diretor:** **NÚCLEO COMPARTILHADO + MODOS por cima.** Não duplicar o
motor (biometria, terminal, segurança); **variar a lógica de negócio e o
frontend por modo**.

**Objetivo deste documento:** desenhar o núcleo e os pontos de extensão de forma
que **não feche portas** para os modos futuros, **sem construí-los nem
superdimensionar**. Generalizar o que é **estruturalmente comum**; deixar
**encaixe (não implementação)** para o que é específico de cada vertical.

---

## 2. Princípio diretor (refinado)

Três camadas, com regra de ouro para cada uma:

1. **MOTOR (núcleo)** — biometria, ISAPI, cripto, auth, expurgo, identidade.
   *Regra:* **generalizar uma vez, nunca duplicar.** Já é agnóstico de vertical.
2. **POLÍTICA (modo)** — validade, retenção, elegibilidade, categoria,
   consentimento, identidade temporal. *Regra:* **um ponto de extensão fino**;
   hoje uma única implementação (EVENTO). Não é framework, é um objeto de
   política resolvido a partir do contexto.
3. **VERTICAL (negócio + UI)** — ciclo de matrícula, assembleia, inadimplência,
   telas. *Regra:* **não construir agora.** Documentar o encaixe e parar aí.

> A maior parte do valor já está pronta na camada 1. O trabalho de arquitetura é
> **não deixar a camada 1 absorver suposições da camada 3** (ex.: "todo mundo
> expira em 2037", "todo mundo é participante de evento", "sempre expurga").

---

## 3. O NÚCLEO — o que JÁ existe e serve como está

Isto **não precisa ser reescrito** para suportar novos modos. É vertical-neutro
por construção (não menciona "evento" na sua lógica essencial).

| Capacidade | Onde vive hoje | Por que já é núcleo |
|---|---|---|
| **Validação de qualidade de face** (gate interocular ≥60px, mediana + histerese, bloqueio total) | `lib/face/detector.ts`, `lib/face/status.ts` (`decideFromReads`, `deriveFaceStatus`) | Mede qualidade de um rosto. Não sabe nem se importa para que serve a pessoa. |
| **Captura de face** (câmera + upload, mobile) | `components/EnhancedFaceCapture.tsx` | UI de captura; a *vertical* decide o fluxo ao redor, não a captura em si. |
| **Decriptação/seleção de face** | `lib/face-image.ts` (`getFaceImageDataUrl`) | Entrega a imagem pronta a partir do `faceData` cifrado. Genérico. |
| **Integração ISAPI** (addUser/uploadFace/registerCard/deleteUser/openDoor; digest-first; erro sanitizado) | `lib/hikvision/client.ts`, `digest-auth.ts` | Fala com o terminal. Não tem conceito de "evento". Os 5 quirks de firmware já tratados. |
| **Criptografia** (AES-256-GCM) | `lib/crypto.ts` (`encryptString`/`decryptToString`/`isEncryptedPayload`) | Primitiva pura. |
| **Agente local + segurança** (token revogável por escopo, face decriptada **na nuvem**, MASTER_KEY nunca no PC, senha do device cifrada em `Terminal`) | `lib/agent/*`, `pages/api/agent/*`, `pages/api/admin/terminals*` | O modelo de confiança (PC sem segredos) vale para **qualquer** contexto com terminais na LAN. |
| **Identidade no terminal** (`employeeNo` sequencial 8díg + `cardNumber` 16díg+Luhn, imutável, idempotente) | `lib/agent/identity.ts` (`assignIdentityIfEligible`) | Números dedicados, sem relação com dado pessoal. Servem a qualquer pessoa, em qualquer modo. |
| **Auth/sessão admin** (NextAuth, papéis, escopo por contexto) | `lib/auth.ts`, `lib/api-auth.ts` | Controle de acesso administrativo; ortogonal ao modo. |
| **Expurgo / retenção** (cron LGPD, `retentionDate`, expurgo sensível) | `lib/participant-sensitive.ts`, `pages/api/cron/lgpd-purge` | O **mecanismo** de expurgo é núcleo; **quando** expurgar é política (§4.5). |

**Limites de capacidade do device (achados 2026-06-17, base de dimensionamento):**
sem licença/expiração; teto **10.000 users/faces/cards por terminal**; com N
terminais cada um guarda o roster inteiro. Vale para qualquer modo. (Ver
`docs`/memória de integração de terminais.)

**Conclusão da §3:** o motor está pronto e é reutilizável **sem alteração**. O
risco não é falta de motor — é o motor **absorver políticas de evento** se a
Fase 2 for escrita ingenuamente (§6).

---

## 4. As ABSTRAÇÕES que mantêm portas abertas (mínimo de mudança hoje)

Para cada uma: **(Hoje)** o que existe · **(Abertura)** a abstração mínima ·
**(NÃO fazer agora)** a tentação a evitar.

### 4.1 `AccessContext` — o conceito acima de "Evento"

Um **evento**, uma **escola**, um **condomínio** são todos a mesma coisa
estrutural: um **contexto de acesso** = *um roster de pessoas + um conjunto de
terminais + uma política (modo)*.

- **(Hoje)** `Event` **já é** o contexto de acesso: tem `terminals`,
  `agentTokens`, `participants`, `requiresApprovalForAccess`. Todo o agente/sync
  já chaveia por `eventId` (`AgentToken.eventId`, `Terminal.eventId`,
  `ParticipantTerminalSync`). Ou seja, **o "contexto de acesso" já existe — só se
  chama `Event`.**
- **(Abertura)** Tratar `Event` conceitualmente como `AccessContext` na
  documentação e nas **interfaces da Fase 2** (falar "contexto/roster", não
  "evento/participantes"). Se/quando o 2º vertical existir, há dois caminhos
  baratos: (a) renomear `Event`→`AccessContext` com `mode`; ou (b) manter `Event`
  como uma das formas de contexto. A escolha depende de quão diferente a escola
  é — **decidir lá, não aqui**.
- **(NÃO fazer agora)** Criar tabela `AccessContext` separada, hierarquia
  polimórfica, ou migrar `Event`. Não há 2º consumidor; é refator especulativo.
  `Event` paga a conta hoje.

### 4.2 `AccessSubject` — "Pessoa com acesso" com categoria extensível

- **(Hoje)** `Participant` = credenciado de evento. Não há campo de "categoria";
  todo mundo é implicitamente a mesma coisa.
- **(Abertura)** O conceito de pessoa-com-acesso deve admitir uma **categoria de
  vocabulário aberto** (string, não enum de banco): hoje `event_attendee`;
  futuro `resident`/`student`/`visitor`/`supplier`/`teacher`. **Crucial:** o
  núcleo (elegibilidade, identidade, sync) **não deve ramificar por categoria** —
  ele opera sobre sinais genéricos (tem face usável? está ativo? validade ok?).
  A categoria é **rótulo de negócio/relatório**, não chave de lógica do motor.
- **(NÃO fazer agora)** Adicionar `Participant.category` sem consumidor (campo
  vazio apodrece), criar enum rígido, ou uma hierarquia de tipos. Quando houver
  vertical, é **uma coluna string com default `event_attendee`** — trivial de
  adicionar **depois**.

### 4.3 Validade temporal como **parâmetro do modo**

Esta é a generalização direta do achado de hoje sobre o `endTime` do device.

- **(Hoje)** O `addUser` de produção grava `Valid.endTime = 2037-12-31` (teto do
  device). É uma **constante**. A invariante "nunca data curta" foi anotada
  porque, **no modo evento**, expirar alguém no meio do evento é um bug — e o
  evento é curto e expurga depois, então 2037 é seguro e simples.
- **(Abertura)** Validade é **política do contexto**, não constante:
  `resolveValidity(context, subject) → { begin, end }`.
  - EVENTO → `end` longe (2037) — pessoas não podem expirar durante o evento.
  - ESCOLA → `end` = fim do ano letivo; **renovado a cada período**.
  - CONDOMÍNIO → `end` = fim do contrato/locação; renovado.
  O **mecanismo** (`Valid.endTime` no terminal) é núcleo; a **fonte do valor** é o
  modo. A invariante geral vira: *"endTime = fim da validade do contexto, e o
  contexto é dono da renovação"* — a constante 2037 é só **o valor da política do
  modo EVENTO**.
- **(NÃO fazer agora)** Construir agendador de renovação, calendário letivo, ou
  máquina de validade. Hoje: **manter 2037 para evento** e, na Fase 2, ler o
  `endTime` de uma função/política (mesmo que ela só retorne 2037 por enquanto) —
  ver §6. Isso é enquadramento, não feature.

### 4.4 Estado da pessoa — extensível

- **(Hoje)** Estado é um **conjunto de strings**, não enum de banco:
  `approvalStatus` (pending/approved/rejected/review), `status`
  (active/removed), `isDeleted`. Já é extensível no nível do dado.
- **(Abertura)** Futuros estados (suspenso/transferido/inadimplente/
  visitante-temporário) entram como **novos valores de string**. O que importa é
  que exista **um único ponto de decisão de elegibilidade** que traduz
  "estado → pode acessar?". Esse ponto **já existe**: `lib/agent/eligibility.ts`
  (`status='active' AND !isDeleted AND face utilizável AND (approved SE o
  contexto exige aprovação)`). Modos novos **contribuem predicados**
  (inadimplente → não elegível mesmo "ativo") nesse mesmo gargalo.
- **(NÃO fazer agora)** Máquina de estados formal, tabela de transições, ou
  workflow engine. Os estados futuros são incertos; **strings + o gargalo único
  de elegibilidade** cobrem o caso por muito tempo. Quando um estado novo nascer,
  é **mais um predicado** na função que já existe.

### 4.5 Retenção como **política do modo**

- **(Hoje)** `Participant.retentionDate` (nullable) + cron LGPD que expurga o que
  passou da data + expurgo manual no fim do evento. O **mecanismo** é genérico e
  chaveado por data.
- **(Abertura)** **Quando/se** expurgar é decisão do modo:
  - EVENTO → define `retentionDate` (expurga ao fim do ciclo legal/evento).
  - PERMANENTE → `retentionDate` nulo/longe enquanto a pessoa está vinculada;
    expurga **na saída** (aluno formou, morador mudou), não no calendário do
    evento. **Mantém e atualiza** em vez de apagar.
  O motor de expurgo **não muda**; muda **quem seta a data** (o modo).
- **(NÃO fazer agora)** Hard-codar "sempre expurga tudo no fim" em qualquer lugar
  do núcleo, nem construir políticas de retenção por vertical. Hoje o expurgo já
  é por `retentionDate` — basta **não** assumir, no código novo, que todo
  contexto expurga.

### 4.6 O amarrador: o conceito de **Modo** (`ModeProfile`)

As cinco aberturas acima convergem num único conceito: um **Modo** é um
**pacote de política** resolvido a partir do contexto, que responde:

```
ModeProfile (conceitual — NÃO criar agora):
  validity(context, subject)      -> { begin, end }      // §4.3
  retention(context, subject)     -> retentionDate | null // §4.5
  eligibilityExtra(subject)       -> predicados extra      // §4.4
  defaultCategory                 -> string                // §4.2
  requiresConsent / consentKind   -> ...                   // vertical (§7)
  frontend                        -> qual UI               // vertical (§7)
```

- **(Hoje)** Existe **exatamente um** modo, **implícito**: EVENTO. Os valores
  acima estão espalhados como constantes/regras (endTime=2037,
  `requiresApprovalForAccess`, expurgo).
- **(Abertura)** Reconhecer o `ModeProfile` como **o ponto de extensão**. Um
  campo discriminador (`Event.mode`/`context.mode`, default `'event'`) é a
  semente — **mas só vale a pena quando existir o 2º modo**.
- **(NÃO fazer agora)** Implementar um registry de modos, herança de perfis, ou o
  campo `mode` sem 2º consumidor. **O `ModeProfile` é um conceito de desenho
  hoje, não código.**

---

## 5. Mapa "hoje → futuro" (uma olhada só)

| Conceito | Hoje (concreto) | Generalização | Quando materializar |
|---|---|---|---|
| Contexto | `Event` | `AccessContext` (Event é um caso) | só no 2º vertical |
| Pessoa | `Participant` (credenciado) | `AccessSubject` + `category` string | só no 2º vertical |
| Validade | `endTime=2037` constante | `validity(context,subject)` política | **enquadrar na Fase 2** |
| Estado | strings + eligibility | mesmos + predicados por modo | incremental, quando surgir estado |
| Retenção | `retentionDate` + cron | política do modo seta a data | **enquadrar na Fase 2** |
| Modo | implícito (EVENTO) | `ModeProfile` + discriminador | só no 2º modo |
| Identidade | employeeNo+card | (já genérico — núcleo) | — |
| Motor (face/ISAPI/cripto) | libs atuais | (já genérico — núcleo) | — |

---

## 6. Fase 2 do sync — construir JÁ pensando no núcleo (sem fechar porta)

A Fase 2 (fan-out + reconciliação para N terminais + push automático
cadastro→sync) é o **próximo código real**. Ela é o lugar onde é barato **não
fechar portas** — e caro fechá-las. Diretrizes de enquadramento (não são
features novas, são escolhas de vocabulário e de origem-de-valor):

1. **Falar em "roster de um contexto de acesso", não "participantes de um
   evento".** As funções/tipos do sync recebem um *contexto* e seu *roster de
   subjects*. Internamente hoje o contexto **é** o `Event` e o roster **são** os
   `Participant` — mas o sync **não deve assumir o ciclo de vida de evento**
   (ex.: não embutir "expurga no fim", não assumir população efêmera). Custo
   hoje: ~zero (é nome de variável/tipo). Ganho: o motor de sync serve escola sem
   reescrita.

2. **Derivar `endTime` de uma política, não de uma constante.** No ponto onde o
   `addUser`/atualização monta `Valid`, chamar algo como
   `resolveValidity(context, subject)` que **hoje retorna 2037** para o modo
   evento. Não é um sistema de validade — é **um ponto de indireção** de uma
   linha, que impede a constante 2037 de se espalhar pelo código e vira o gancho
   natural para "fim do ano letivo" depois. **A invariante "evento nunca expira
   no meio" continua valendo — ela passa a ser o valor que a política do modo
   evento devolve.**

3. **Tratar atualização de face como operação de 1ª classe (não só add/delete).**
   A escola precisa **re-capturar** a foto do aluno que cresce; o evento quase
   nunca. Já descobrimos que o device **rejeita sobrescrever face**
   (`deviceUserAlreadyExistFace`) → atualizar exige **apagar a face e re-subir**
   (ou delete+add do usuário). Implicações de desenho para a Fase 2:
   - O estado de sync (`ParticipantTerminalSync`) deve rastrear uma **versão/hash
     da face** (e do card/validade), para detectar "a face mudou → re-empurrar".
   - O reconciliador precisa de um caminho **"update face"** explícito, não só
     "presente/ausente". Para evento isso quase nunca dispara; para permanente é
     rotina. **Desenhar o estado para admitir mudança de face não custa nada
     hoje** e evita um retrabalho estrutural depois.

4. **Reconciliação pagina 30/página.** Buscas ISAPI retornam no máx 30
   (`maxResults`); iterar `searchResultPosition` até `totalMatches`. Vale para
   qualquer modo (achado de device).

5. **Elegibilidade continua no gargalo único** (`lib/agent/eligibility.ts`). O
   fan-out pergunta a esse gargalo "esta pessoa deve estar neste terminal?"; não
   reimplementa regra. Modos futuros estendem **lá**.

> Resumo da §6: a Fase 2 deve ser escrita **context-neutral, com validade vinda
> de política e face versionada**. Isso é **enquadramento de baixo/zero custo**,
> não construção de modos.

---

## 7. Portas abertas explícitas — encaixe documentado, **não construído**

O que fica **deliberadamente fora** agora. Para cada um, o **ponto de encaixe**
onde plugaria no futuro — para que ninguém ache que está "esquecido".

| Vertical-específico (não construir) | Onde encaixaria (ponto de extensão) |
|---|---|
| **Regras de ciclo de matrícula** (escola) | serviço por modo + `validity()`/`retention()` do `ModeProfile`; estados em §4.4 |
| **Assembleia / inadimplência** (condomínio) | `eligibilityExtra()` (inadimplente → não elegível) + estado string |
| **Consentimento parental / LGPD de menor** | `requiresConsent/consentKind` do modo + campos `consent*` que já existem em `Participant` |
| **Categorias exatas por vertical** (morador/aluno/professor/…) | `category` string de vocabulário aberto (§4.2); **não enumerar agora** |
| **Frontends por modo** (cadastro/admin da escola ≠ do evento) | núcleo permanece API; cada modo tem sua UI. App Router já permite rotas por modo. **Não construir** |
| **Renovação automática de validade** (fim de período letivo) | gancho `validity()` + um job futuro; hoje é manual/2037 |

**Regra para todos:** documentar o encaixe (acima) e **parar**. Nenhum stub,
nenhum campo, nenhuma interface "só por garantia".

---

## 8. Riscos de SUPERDIMENSIONAR — onde NÃO abstrair agora (e por quê)

A tentação de "já deixar genérico" é o maior risco deste trabalho. Onde **não**
ceder:

1. **NÃO criar `AccessContext`/`AccessSubject` como tabelas/hierarquia agora.**
   `Event`+`Participant` já cumprem o papel. Extrair antes do 2º vertical existir
   é refator especulativo que **adiciona indireção sem consumidor** e torna o
   código de hoje mais difícil de ler. **Renomear/extrair é barato depois**,
   quando a escola for concreta e disser o que realmente difere.

2. **NÃO construir um framework/registry de modos.** Existe **um** modo. Um
   `ModeProfile` com herança, plugins e descoberta dinâmica para um único caso é
   YAGNI clássico. O conceito basta no papel; a 1ª implementação real pode ser
   um simples `switch`/objeto quando o 2º modo chegar.

3. **NÃO formalizar máquina de estados.** Os estados futuros
   (suspenso/inadimplente/…) são **incertos** em número e semântica. Uma máquina
   de estados rígida agora vai estar errada quando o vertical chegar. Strings +
   gargalo de elegibilidade são flexíveis e suficientes.

4. **NÃO adicionar campos vazios** (`category`, `mode`) sem consumidor. Campo sem
   leitor apodrece, gera migração inútil e induz lógica morta.

5. **NÃO generalizar o frontend.** Telas por modo divergem muito; uma "UI
   genérica de acesso" parametrizada por config tende a virar um motor de
   formulário difícil de manter. Cada modo terá sua UI; o núcleo é API.

6. **NÃO transformar `validity()`/`retention()` em "engine" agora.** São, hoje,
   **funções de uma linha** (retornam 2037 / setam `retentionDate`). O valor está
   em **existirem como ponto de indireção**, não em serem configuráveis.

> Heurística: **generalizar o MOTOR (feito), deixar a POLÍTICA como costura fina
> (1–2 pontos de indireção na Fase 2), e ADIAR o VERTICAL inteiro.** Onde o
> futuro é incerto, manter concreto e simples — porque desfazer uma abstração
> errada custa mais do que adicionar a abstração certa quando a hora chegar.

---

## 9. O que muda HOJE vs. o que fica adiado

**Muda hoje:** **nada no código de produção.** Entregável = **este documento**.

**Enquadra-se quando a Fase 2 for construída** (escolhas de desenho, custo
~zero, dentro do trabalho já planejado):
- Tipos/funções do sync em termos de **contexto + roster** (não evento +
  participantes), sem assumir ciclo de vida efêmero.
- `endTime` vindo de **`resolveValidity(context, subject)`** (retornando 2037 no
  modo evento) em vez de constante espalhada.
- `ParticipantTerminalSync` rastreando **versão/hash de face** (e card/validade)
  → caminho de **atualização de face** de 1ª classe.
- Reconciliação **paginando** 30/página.
- Elegibilidade no **gargalo único** existente.

**Fica explicitamente adiado** (só quando o 2º modo for real):
- Campo `mode`/`category`, tabela `AccessContext`, `ModeProfile` como código,
  estados novos, regras de vertical, frontends por modo, renovação automática.

---

## 10. Glossário

- **Núcleo / motor:** código vertical-neutro reutilizável sem alteração
  (biometria, ISAPI, cripto, auth, expurgo, identidade).
- **Modo:** pacote de política (validade, retenção, elegibilidade, categoria,
  consentimento, UI) sobre o núcleo. Hoje: **EVENTO** (único, implícito).
- **Contexto de acesso (`AccessContext`):** roster de pessoas + terminais +
  política. Hoje materializado como `Event`.
- **Pessoa com acesso (`AccessSubject`):** indivíduo elegível a acessar um
  contexto. Hoje materializado como `Participant` (categoria implícita
  `event_attendee`).
- **Política de validade/retenção:** funções que derivam `endTime`/`retentionDate`
  do contexto. Hoje constantes do modo evento (2037 / `retentionDate`).
- **Roster:** o conjunto de subjects de um contexto a sincronizar com os
  terminais daquele contexto.

---

*Revisão pendente. Próximo passo sugerido: validar o enquadramento da §6 (Fase 2)
antes de iniciar a implementação do sync — é o único ponto onde decisões de hoje
afetam portas futuras.*
