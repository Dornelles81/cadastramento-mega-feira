# Fase 2 do sync — plano fatiado (aprovado)

> Companheiro de [`arquitetura-nucleo-modos.md`](./arquitetura-nucleo-modos.md).
> Segue o **§6** daquele documento: falar em **contexto + roster**, `endTime` de
> **`resolveValidity()`**, **face versionada**, **paginação 30/página**.
> Aprovado para execução em 2026-06-17.

## Estado atual (Fase 0/1 pronto × buraco da Fase 2)

| Pronto | Buraco (Fase 2) |
|---|---|
| `ParticipantTerminalSync` (estado por-terminal: face/card/removal, `attempts`/backoff, índices de fila) | **Ninguém popula a tabela** → `/work` lê vazio |
| `/api/agent/work` (lê linhas pendentes, **decripta face na nuvem**, checa elegibilidade) | Usa `deriveEmployeeNo` **antigo** (≠ `employeeNo` da Fase 1); não envia validade |
| `/api/agent/ack` (atualiza estado por kind, escopo do token) | Vocabulário divergente (`ack` grava `done`, modelo diz `synced`) |
| `/api/agent/terminals`, `/heartbeat`, token revogável por escopo | **Não há agente real** (só `test-agent-flow.ts` fake) |
| Identidade atribuída em `approve-participant` (employeeNo seq + card Luhn) | Caminho **sem-aprovação** não atribui identidade nem enfileira |
| 5 ops ISAPI provadas no hardware real (`bench-flow.ts`) | Sem fan-out, sem reconciliação, sem versão de face |

## Decisões transversais (aprovadas)

- **A. employeeNo:** `/work` usa `Participant.employeeNo` (Fase 1) e aposenta `deriveEmployeeNo`. ✅
- **B. Vocabulário de estado:** `face/cardState ∈ pending|synced|failed|na`, `removalState ∈ none|pending|removed|failed`; corrigir o `ack` que grava `done`. ✅
- **C. Fonte da verdade = DB;** o device é reconciliado, nunca manda. ✅
- **D. Runtime do agente = executável Windows (`.exe`), click-to-run.** Qualquer pessoa da equipe liga o agente sem conhecimento técnico — só clicar. Construído na F3. ✅
- **E. "Face mudou" = hash do `faceData`** (robusto a re-cifra/IV), não `updatedAt`. ✅
- **F. Validade no payload:** a nuvem manda `validEnd` em `/work`; o agente **só aplica**, não calcula. ✅

## Fatias

### F1 — Contrato do `/work` correto + validade por política
- **Muda:** `/work` usa `Participant.employeeNo` + `p.cardNumber` (aposenta `deriveEmployeeNo`); novo `lib/agent/validity.ts::resolveValidity(context, subject) → {begin, end}` (2037 no modo evento), e o item de push carrega `validEnd`/`validBegin`. Normaliza o vocabulário de estado entre `work`/`ack`/modelo.
- **Testável (dev + 1 real):** semear 1 linha sync à mão (participante aprovado) → `GET /work` retorna employeeNo real + `validEnd=2037` + face decriptada → aplicar via `bench-flow` → `POST /ack` → linha `synced`. Unitário: `resolveValidity`=2037; serialização do payload.
- **Riscos:** não servir linha sem `employeeNo`; alinhar `done`→`synced` sem quebrar o `ack`.

### F2 — Fan-out do enqueue (materializar as linhas) — o coração
- **Muda:** `enqueueForContext(contextId, subjectId)` / `enqueueRemoval(...)` idempotentes nas transições: aprovação (ponto marcado em `approve-participant`), **registro em evento sem-aprovação** (atribuir identidade + enfileirar), remoção (`removalState=pending`), criação de Terminal (backfill do roster elegível). 1 subject elegível → 1 linha por terminal **ativo** (upsert no `@@unique`).
- **Testável (dev + 1 real + 1 mock):** aprovar via API → linhas criadas → `/work` serve → aplica → `synced`. Remover → removal servida → `deleteUser` → `removed`. 2º Terminal (mock) → backfill.
- **Riscos:** ordem (identidade antes do fan-out; wire novo no caminho sem-aprovação); idempotência/concorrência (upsert protege); não enfileirar terminal inativo; não duplicar no backfill.

### F3 — Agente runtime real (`.exe` Windows), com 1 terminal
- **Muda:** programa que roda no PC do evento — autentica com token → loop `GET /work` → aplica ops da Fase 1 (`addUser`+`uploadFace`+`registerCard` / `deleteUser`) com face/`validEnd` recebidos → `POST /ack` → `heartbeat`. Backoff por linha. Empacotado como **`.exe` click-to-run** (decisão D).
- **Testável (dev + 1 real):** rodar o agente contra o token de bancada + `192.168.1.47` → aprovar alguém → **o agente sozinho** escreve e a linha vira `synced`. Primeiro fluxo automático ponta a ponta.
- **Riscos:** ordem das ops (addUser primeiro); erro parcial (estado por-kind cobre); **segurança:** agente nunca recebe MASTER_KEY (face vem pronta) nem connection string (só token); empacotamento `.exe` (assinatura/SmartScreen, tamanho, auto-update).

### F4 — Reconciliação (drift correction), paginada — APROVADA
**Arquitetura (decisão):** o **device só é alcançado pelo agente**; a **nuvem tem o banco (verdade)**. Então o **.exe fica burro**: lista o roster do device e **reporta**; a **nuvem decide** o diff e enfileira; o agente aplica pelo caminho que já existe (`/work`). O banco **nunca** muda pra bater com o device.
- **Fluxo:** agente lista usuários (`UserInfo/Search` **paginado 30/página até `totalMatches`**) → `POST /api/agent/reconcile { terminalId, users:[{employeeNo,numOfFace,numOfCard}] }` → nuvem compara desejado (elegíveis+`employeeNo`) × atual e **enfileira em `ParticipantTerminalSync`**; devolve `removeEmployeeNos` (órfãos sem linha) que o agente **deleta direto** (não há linha p/ enfileirar).
- **Ações por divergência:** faltando → `faceState/cardState=pending` (re-push); órfão **com linha** (inelegível) → `removalState=pending`; órfão **sem linha** (delete-hard/manual no device) → `removeEmployeeNos` (delete direto); incompleto (`numOfFace=0`/`numOfCard=0`) → re-enfileira só o kind.
- **Hook F5 (pronto, não construído):** função `faceNeedsUpdate(participant,row)` que hoje retorna `false`; a F5 adiciona `Participant.faceVersion` + `ParticipantTerminalSync.faceVersion` e a comparação — o reconcile **já chama o hook**, F5 encaixa sem mudar o fluxo.
- **Anti-loop inclusão↔remoção:** (a) `employeeNo` casado como **STRING exata** (nunca coagir p/ número — perderia zeros à esquerda e faria elegível virar "órfão" → loop); (b) **desejado XOR órfão** (mutuamente exclusivos por construção); (c) reconcile reflete o banco deterministicamente; (d) idempotente (re-setar `pending` é no-op).
- **Testável:** unit do diff (faltando/órfão-com-linha/órfão-sem-linha/incompleto) sem device + paginação do lister com mock >30 (zero re-push espúrio nos 31+). Bancada: criar divergência artificial (deletar user no device por fora → re-push; addUser de emp fora do banco → removal; addUser sem face → enfileira face).
- **Riscos:** paginação correta (senão diverge silencioso); custo/rate das buscas no device; reconcile não roda a cada poll (cadência própria, ~60s).

### F5 — Face versionada (re-captura) + caminho de update
- **Muda:** `faceVersion`/hash do `faceData` em `Participant` (e na linha sync); fan-out/reconciliação compara versões → enfileira **update de face**. Device rejeita sobrescrever (`deviceUserAlreadyExistFace`) → update = apagar face (ou delete+add do usuário) e re-subir (operação de 1ª classe; escola re-captura, evento quase nunca).
- **Testável (dev + 1 real):** face A → sync → nova coleta → versão muda → update → agente apaga+re-sobe → device com face nova.
- **Riscos:** janela sem-face (delete antes do re-upload) — ordenar; definir "versão" (hash); não otimizar para evento.

### F6 — Operacional (leve, por último)
Painel de estado de sync por terminal + `lastSeenAt`/heartbeat + pendentes/falhas, para o operador ver "todos sincronizados" antes de abrir o portão.

## Ordem e o que NÃO superdimensionar
**Ordem:** F1 → F2 → F3 (já há sync automático single-terminal) → F4 → F5 → F6.
**NÃO fazer agora:** agente multi-evento; scheduler sofisticado de reconciliação (cron simples/manual basta); otimizar re-captura para evento; abstrair `AccessContext` em tabela (continua `Event`, §8 do doc de arquitetura). O ensaio com **4 terminais reais** (latência/carga/falha física) fica para o pré-evento — 1 real + mocks não cobre isso.
