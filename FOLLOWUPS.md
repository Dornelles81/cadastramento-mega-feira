# Follow-ups pendentes — consolidado (2026-06-16)

Backlog único de pendências acumuladas, por urgência. Itens resolvidos no fim, para referência.

---

## 🔴 PRÉ-EVENTO (resolver antes de rodar o evento real)

- **IP fixo dos terminais Hikvision.** Hoje em DHCP. O agente referencia `Terminal.ipAddress`; se o IP mudar, o sync quebra. Fixar IP no device/roteador (reserva DHCP ou IP estático) e cadastrar o IP definitivo em `Terminal`.
- **Senha forte do device.** A atual (`Meg@2016`) é fraca — padrão `<empresa><ano>`, mesma família da `Index2016` comprometida. Trocar por **senha aleatória forte** sem relação com a empresa; entra criptografada em `Terminal.passwordEncrypted` (nunca em código/env/relato). Ver [[device-password-hardcoded]].
- **Usuários OPERATOR (portaria).** Criar contas NextAuth role `OPERATOR` antes do evento — os endpoints `access/*` (check-in/out) exigem sessão. Ver [[fase1-seguranca-pendencias]].
- **(Em andamento) Validação de face no cadastro.** Detector MediaPipe nos dois caminhos (upload é o crítico), gate de **interocular ≥ 50px**, bloqueio real (sem "Capturar Mesmo Assim"), `captureQuality` real + `hasValidFace` unificado. Desenho aprovado, limiar calibrado. É a próxima tarefa ativa. Ver [[validacao-face-cadastro-morta]].
- **(Fase 2 da integração) Wire do enqueue.** Criar/atualizar `ParticipantTerminalSync` quando alguém fica elegível / é removido, e fan-out para N terminais. Hoje a identidade é atribuída em approve-participant, mas o estado de sync por terminal ainda não é populado. Ver [[device-integration-plan]].

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

- **HikCentralService crash no load** — RESOLVIDO pelo descarte de `lib/hikcentral/*` na Fase 0 Parte 2 (`ddccab5`). Não há lazy-init a fazer. Ver [[hikcentral-sync-module-crash]].
- **Backfill de re-medição de face dos legados** — **MOOT**: os 333 do FEICAP (única base real restante) tiveram a biometria expurgada; não há face para re-medir. O grupo de teste foi deletado. A validação de face nova só se aplica a cadastros futuros.
- **Senha `Index2016` no código** — removida de todo o repositório (código `ce95b7d` + docs `a678be8`).
- **Credenciais de banco de produção** — rotacionadas, Vercel/`.env` atualizados, produção validada.
- **Path traversal em `uploads/[filename]`** — corrigido (`0989463`).
- **Expurgo FEICAP (333) + delete grupo teste (26)** — executados e verificados 2026-06-16. **Nota:** o FEICAP tinha `retentionDate=2026-07-20` (expurgo automático pelo cron LGPD nessa data); o **expurgo manual de hoje por cancelamento adiantou isso** → o agendamento de 20/jul ficou **sem efeito** (a biometria já está null; o cron não acha nada para expurgar). Não há expurgo duplicado.
- **Projeto Neon `mega-feira-facial` (`ep-billowing-bonus`)** — DELETADO pelo usuário no console (2026-06-16); a credencial vazada que ainda conectava **morreu junto** (verificado: autenticação falha). Ver [[credenciais-vazadas-git]].
