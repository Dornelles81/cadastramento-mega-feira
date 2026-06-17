# Follow-ups pendentes — consolidado (2026-06-17)

Backlog único de pendências acumuladas, por urgência. Itens resolvidos no fim, para referência.

---

## 🔴 PRÉ-EVENTO (resolver antes de rodar o evento real)

- **IP fixo dos terminais Hikvision.** Hoje em DHCP. O agente referencia `Terminal.ipAddress`; se o IP mudar, o sync quebra. Fixar IP no device/roteador (reserva DHCP ou IP estático) e cadastrar o IP definitivo em `Terminal`.
- **NTP acessível na rede do evento (ou fixar a hora no device antes).** O terminal usa NTP; se o servidor ficar inacessível e o device reiniciar/perder RTC, a hora deriva. Não bloqueia o acesso (a validade dos usuários é 2037), mas **bagunça os timestamps dos registros de acesso**. Garantir NTP na LAN do evento ou setar a hora manualmente no device antes de abrir.
- **Senha forte do device.** A atual (`Meg@2016`) é fraca — padrão `<empresa><ano>`, mesma família da `Index2016` comprometida. Trocar por **senha aleatória forte** sem relação com a empresa; entra criptografada em `Terminal.passwordEncrypted` (nunca em código/env/relato). Ver [[device-password-hardcoded]].
- **Usuários OPERATOR (portaria).** Criar contas NextAuth role `OPERATOR` antes do evento — os endpoints `access/*` (check-in/out) exigem sessão. Ver [[fase1-seguranca-pendencias]].
- **(Próximo evento, sem urgência) Fase 2 do sync.** Wire do enqueue: criar/atualizar `ParticipantTerminalSync` quando alguém fica elegível / é removido, **fan-out para N terminais** e **reconciliação**, mais o **push automático cadastro→sync** (hoje a identidade é atribuída em approve-participant, mas o estado de sync por terminal não é populado e o push é manual). **Invariantes a blindar no código (achados do device real 2026-06-17):** (a) **`Valid.endTime` SEMPRE `2037-12-31T23:59:59`, NUNCA data curta** — endTime curto faz o usuário expirar e sumir do terminal no meio do evento (o `addUser` atual já está correto, manter no fan-out); (b) **paginação obrigatória — buscas ISAPI retornam máx 30/página**, a reconciliação tem que iterar `searchResultPosition` até `totalMatches` ou diverge silenciosamente. Ver [[device-integration-plan]].

## 🟡 DÍVIDA TÉCNICA

- **`AuditLog.actorType` nullable → NOT NULL.** É nullable de propósito porque ~13 escritores legados do AuditLog não preenchem. Migrar esses escritores para o formato do adendo (sempre setar `actorType`) e então tornar NOT NULL. Ver [[acesso-por-stand-status]].
- **Aposentar flags single-device legados.** `Participant.ivimsSync`/`ivimsSyncedAt`/`pendingDeviceRemoval` + `scripts/sync-faces-ivms.ts` — depois que o sync novo (agente / `ParticipantTerminalSync`) for provado no evento. Não deixar dois mecanismos de sync convivendo. Ver [[device-integration-plan]].
- **Aposentar endpoints de sync antigos.** `pages/api/admin/sync-hikvision.ts`, `sync-hikcental.ts` (e o iVMS) — superados pelo caminho do agente. Ao aposentá-los, o "fix GCM nos sync" de [[auth-refactors-pendentes]] vira **moot** (o agente decripta a face na nuvem; não depende desses endpoints).
- **Remoção de CORS `*`.** `Access-Control-Allow-Origin: *` em vários endpoints admin — positivo de segurança, ainda pendente. Ver [[auth-refactors-pendentes]].
- **Campo custom tipo `file` em produção → base64.** Filesystem da Vercel é read-only → `/api/upload` falha em prod; 3 campos `file` existem. Migrar para base64 no banco (padrão do DocumentField). Ver [[acesso-por-stand-status]] / [[fase1-seguranca-pendencias]].
- **Histórico do Git.** As 3 connection strings Neon (e admin123, SECRET_KEY default) seguem no histórico. As credenciais de banco vivas já foram rotacionadas; reescrita do histórico (BFG/filter-repo) é **opcional** — fazer só depois de confirmar que todos os endpoints Neon antigos estão mortos/rotacionados. Ver [[credenciais-vazadas-git]].
- **`Stand.currentCount` é cache derivado** de `count(status='active')` — auditar usos que o tratem como fonte de verdade. (menor) Ver [[acesso-por-stand-status]].
- **Stubs/duplicatas mortas:** `export/participants/[id]/image` é mock (404 p/ ids reais); `participants/[id]/image` é duplicata morta de `participant-image`. (menor) Ver [[acesso-por-stand-status]].

## 🟢 LGPD / PRIVACIDADE

- **Faxina do projeto Neon antigo `Facial-Data-Collection`** (~64MB, **provável biometria** de gente real). A credencial vazada dele (`ep-crimson-math`) já está morta, mas o **projeto e os dados continuam no Neon** — verificar conteúdo e deletar/expurgar no console. Ver [[credenciais-vazadas-git]].
- **Anonimização de CPF pós-prazo prescricional.** Política em aberto (Lacuna 3): nome/CPF mantidos como prova; definir quando anonimizar após a retenção legal. Vale para todos os participantes preservados.
- **Contato do FEICAP → 2ª limpeza.** Os 333 do FEICAP tiveram a biometria expurgada, mas `cpf/email/phone` foram mantidos **só porque o evento pode ser reagendado**. Se **não for reagendado em prazo razoável**, o contato perde finalidade → anonimizar (2ª limpeza). Sem data concreta. Ver [[feicap-expurgo-lgpd]].
- **Scrub cosmético de `admin123` nos docs.** Não é credencial viva (produção usa outra), mas aparece em vários `.md`. (menor)

---

## ✅ Resolvidos recentemente (NÃO refazer — referência)

- **Validação de face no cadastro — COMPLETA e validada ponta a ponta (2026-06-17).** Detector MediaPipe real nos DOIS caminhos (câmera + upload), gate de **interocular ≥ 60px** (calibrado na bancada), bloqueio total (sem "Capturar mesmo assim"), `captureQuality` fictício substituído por `faceInterocularPx` real + `hasValidFace` unificado (`lib/face/status.ts`). **Furo do gate sem-rosto corrigido** (`b40e3c9`: maioria estrita + `noFace` imediato). **Layout do botão resolvido no APARELHO REAL** (`d34d7a8`: botão fixo no rodapé com safe-area + câmera em `svh` + dicas escondidas quando ok). **Admin renderiza sem React #310** (`a3de70e`: `useRef` movido p/ antes dos early-returns). **Validado em produção** (câmera + upload no celular) **E em bancada** (push pelo caminho de produção → `uploadFace` aceitou a face do gate de 60px → terminal reconheceu e **abriu a porta com o relé**). Dado de teste 100% expurgado (device 0 usuários, evento de teste deletado, biometria sumiu). Ver [[validacao-face-cadastro-morta]] e [[deploy-gap-celular-producao]].
- **Auditoria de licença/limites do terminal Hikvision** — RESOLVIDA (2026-06-17, lido do device real `192.168.1.47`): **SEM licença/ativação/expiração** (`/ISAPI/System/license` e `/licenseInfo` → 404 `notSupport`; sem campo de validade no `deviceInfo`/`capabilities`). **Único teto: 10.000 users/faces/cards POR TERMINAL** — confortável (eventos reais ≤333, alvo 2.000 ≈ 20% do teto, ~5× de folga). Nada para/expira por tempo ou licença. **Risco estratégico de longo prazo (não-técnico):** restrições comerciais à Hikvision podem afetar compra/suporte/firmware futuros → avaliar fornecedor alternativo se a operação escalar. Ver [[device-integration-plan]].
- **HikCentralService crash no load** — RESOLVIDO pelo descarte de `lib/hikcentral/*` na Fase 0 Parte 2 (`ddccab5`). Não há lazy-init a fazer. Ver [[hikcentral-sync-module-crash]].
- **Backfill de re-medição de face dos legados** — **MOOT**: os 333 do FEICAP (única base real restante) tiveram a biometria expurgada; não há face para re-medir. O grupo de teste foi deletado. A validação de face nova só se aplica a cadastros futuros.
- **Senha `Index2016` no código** — removida de todo o repositório (código `ce95b7d` + docs `a678be8`).
- **Credenciais de banco de produção** — rotacionadas, Vercel/`.env` atualizados, produção validada.
- **Path traversal em `uploads/[filename]`** — corrigido (`0989463`).
- **Expurgo FEICAP (333) + delete grupo teste (26)** — executados e verificados 2026-06-16. **Nota:** o FEICAP tinha `retentionDate=2026-07-20` (expurgo automático pelo cron LGPD nessa data); o **expurgo manual de hoje por cancelamento adiantou isso** → o agendamento de 20/jul ficou **sem efeito** (a biometria já está null; o cron não acha nada para expurgar). Não há expurgo duplicado.
- **Projeto Neon `mega-feira-facial` (`ep-billowing-bonus`)** — DELETADO pelo usuário no console (2026-06-16); a credencial vazada que ainda conectava **morreu junto** (verificado: autenticação falha). Ver [[credenciais-vazadas-git]].
