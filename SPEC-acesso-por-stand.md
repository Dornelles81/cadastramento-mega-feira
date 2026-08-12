# SPEC — Acesso Delegado por Stand (Mega Credenciamento)

## Contexto

Hoje o sistema exibe uma lista pública com todos os stands disponíveis e o usuário escolhe onde se cadastrar. Isso será substituído por um modelo de **acesso delegado**: cada stand tem um responsável (identificado por e-mail) que recebe um **link mágico exclusivo**. Por esse link, ele acessa um painel restrito ao seu próprio stand, compartilha o cadastro com sua equipe, acompanha a ocupação e pode excluir credenciados (com log de auditoria) para liberar vagas.

Stack existente: Next.js 14 App Router + TypeScript + Neon PostgreSQL + NextAuth.js v5 + Vercel. Biometria facial armazenada com AES-256-CBC.

## Objetivos

1. Remover a listagem pública de stands da página de cadastro.
2. Cada stand passa a ter um responsável com e-mail cadastrado pelo admin.
3. O responsável recebe por e-mail um link mágico que dá acesso **somente ao seu stand** (sem visualizar os demais).
4. O link pode ser compartilhado pelo responsável com sua equipe para cadastro de credenciados.
5. Painel do responsável mostra ocupação em tempo real (X de Y vagas) e lista de credenciados do stand.
6. O responsável pode excluir um credenciado para liberar vaga — **toda exclusão gera registro de auditoria imutável**.
7. O admin pode revogar e regenerar o link de qualquer stand.

## Não-objetivos (fora de escopo nesta fase)

- Login com senha para responsáveis (o link mágico É a credencial).
- Auto-cadastro de stands por expositores.
- Notificações além do e-mail de envio do link.

---

## 1. Modelo de dados (migrations no Neon)

### 1.1 Alteração na tabela `stands` (ou equivalente existente — verificar nome real no schema)

```sql
ALTER TABLE stands
  ADD COLUMN responsavel_nome TEXT,
  ADD COLUMN responsavel_email TEXT,
  ADD COLUMN limite_vagas INTEGER NOT NULL DEFAULT 0;
```

> Se `limite_vagas` já existir com outro nome, reaproveitar. Não duplicar.

### 1.2 Nova tabela `stand_access_tokens`

```sql
CREATE TABLE stand_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_id UUID NOT NULL REFERENCES stands(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 do token; nunca armazenar o token em claro
  created_by UUID REFERENCES users(id),   -- admin que gerou
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                 -- NULL = sem expiração (default: fim do evento)
  revoked_at TIMESTAMPTZ,                 -- NULL = ativo
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_stand_tokens_stand ON stand_access_tokens(stand_id);
```

Regras:
- Apenas **um token ativo por stand** (ao regenerar, revogar o anterior: `revoked_at = now()`).
- Token: 32 bytes aleatórios (`crypto.randomBytes(32)`), codificado em base64url. No banco, guardar apenas o hash SHA-256.

### 1.3 Nova tabela `audit_logs`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_id UUID REFERENCES stands(id),
  acao TEXT NOT NULL,            -- 'EXCLUSAO_CREDENCIADO' | 'TOKEN_GERADO' | 'TOKEN_REVOGADO' | 'ACESSO_PAINEL'
  ator_tipo TEXT NOT NULL,       -- 'responsavel_stand' | 'admin'
  ator_identificacao TEXT,       -- email do responsável ou id/email do admin
  alvo_credenciado_id UUID,      -- credenciado afetado (quando aplicável)
  alvo_snapshot JSONB,           -- snapshot dos dados não-sensíveis do credenciado no momento da exclusão (nome, documento mascarado, data do cadastro). NUNCA incluir biometria.
  motivo TEXT,                   -- motivo informado na exclusão (opcional, campo livre)
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_stand ON audit_logs(stand_id, created_at DESC);
```

Regras:
- Tabela **append-only**: nenhuma rota da aplicação faz UPDATE ou DELETE nela.

### 1.4 Alteração na tabela de credenciados

```sql
ALTER TABLE credenciados   -- verificar nome real (ex.: candidatos/credenciais)
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo',  -- 'ativo' | 'removido'
  ADD COLUMN removido_em TIMESTAMPTZ,
  ADD COLUMN removido_por TEXT;                     -- email do responsável ou admin
```

---

## 2. Fluxos

### 2.1 Admin cadastra/edita stand

- No painel admin existente, formulário do stand ganha campos: `responsavel_nome`, `responsavel_email`, `limite_vagas`.
- Botão **"Gerar e enviar link de acesso"**:
  1. Gera token, salva hash em `stand_access_tokens` (revogando token anterior se houver).
  2. Envia e-mail ao responsável com o link `https://megacredenciamento.com.br/stand/{token}`.
  3. Registra `TOKEN_GERADO` em `audit_logs`.
- Botão **"Revogar acesso"**: marca `revoked_at`, registra `TOKEN_REVOGADO`.
- E-mail transacional: usar **Resend** (integração simples com Next.js/Vercel). Template com identidade visual Mega Feira (teal #2DD4BF / navy #1E3A5F), nome do evento, nome do stand, link e orientação de que o link pode ser compartilhado com a equipe, mas dá acesso ao painel do stand.

### 2.2 Responsável acessa o painel do stand

Rota: `app/stand/[token]/page.tsx` (Server Component).

1. Middleware/loader valida o token: calcula SHA-256, busca em `stand_access_tokens` onde `revoked_at IS NULL` e (`expires_at IS NULL OR expires_at > now()`).
2. Token inválido/revogado → página de erro amigável ("Link inválido ou expirado. Contate a organização.") com status 404 — **não revelar se o stand existe**.
3. Token válido → atualiza `last_used_at`, registra `ACESSO_PAINEL` (com throttle: no máximo 1 log de acesso por token por hora, para não inundar a auditoria) e renderiza o painel.

Painel exibe:
- Nome do stand e do evento.
- **Ocupação**: barra de progresso `X / limite_vagas` (contar apenas credenciados `status = 'ativo'`).
- Lista de credenciados ativos: nome, documento mascarado (ex.: `123.***.***-44`), data do cadastro, foto em miniatura se aplicável.
- Botão **"Cadastrar credenciado"** → leva ao formulário de cadastro já vinculado ao stand (seção 2.3).
- Botão **"Excluir"** por credenciado (seção 2.4).
- **Nenhuma informação de outros stands pode aparecer em nenhuma resposta de API ou página desta rota.**

### 2.3 Cadastro de credenciado via link

- O formulário de cadastro atual passa a viver em `app/stand/[token]/cadastro/page.tsx` (ou recebe o token como contexto).
- O campo de seleção de stand é **removido da UI**; o `stand_id` vem exclusivamente da validação server-side do token. Nunca aceitar `stand_id` vindo do client.
- Antes de gravar, validar vaga disponível **dentro de uma transação** com lock para evitar corrida:

```sql
BEGIN;
SELECT count(*) FROM credenciados
  WHERE stand_id = $1 AND status = 'ativo'
  FOR UPDATE;  -- ou usar SELECT ... FROM stands WHERE id = $1 FOR UPDATE
-- se count >= limite_vagas → ROLLBACK e retornar erro "Stand lotado"
INSERT INTO credenciados (...);
COMMIT;
```

- Fluxo de biometria facial permanece o mesmo (captura → AES-256-CBC → Neon → sync iVMS via script existente).
- A rota antiga de cadastro com lista de stands deve ser **desativada** (redirect para página informativa: "O cadastro agora é feito pelo link enviado ao responsável do seu stand").

### 2.4 Exclusão de credenciado pelo responsável

- Botão "Excluir" abre modal de confirmação com campo opcional **motivo**.
- Server Action / Route Handler:
  1. Revalida o token do stand (nunca confiar no client).
  2. Verifica que o credenciado pertence ao `stand_id` do token e está `ativo`.
  3. Em transação:
     - `UPDATE credenciados SET status='removido', removido_em=now(), removido_por=$email`.
     - **Apagar o dado biométrico facial** do credenciado (DELETE/NULL no campo criptografado) — conformidade LGPD: dado sensível não deve persistir após exclusão.
     - INSERT em `audit_logs` com `acao='EXCLUSAO_CREDENCIADO'`, snapshot não-sensível, motivo, ip, user_agent.
  4. Disparar remoção da face no Hikvision/iVMS (reaproveitar lógica do `scripts/sync-faces-ivms.ts` — criar função de remoção via ISAPI se ainda não existir; se a remoção remota falhar, gravar em fila/flag `pendente_remocao_ivms` para reprocessamento, sem bloquear a exclusão).
  5. Vaga é liberada automaticamente (a contagem considera apenas `ativo`).
- O credenciado removido **não** aparece mais na lista do painel do responsável (apenas admin vê removidos + logs).

### 2.5 Painel admin — auditoria

- Nova aba/página no admin: visualização de `audit_logs` com filtros por stand, ação e período.
- Exportação CSV opcional (útil para prestação de contas ao promotor do evento).

---

## 3. Segurança

- Token nunca armazenado em claro; comparação sempre por hash.
- Comparação de hash com `crypto.timingSafeEqual`.
- Rate limiting na rota `/stand/[token]` (ex.: 30 req/min por IP) para dificultar enumeração de tokens.
- Todas as queries do painel do responsável **obrigatoriamente filtradas por `stand_id` derivado do token no servidor**. Nenhum endpoint aceita `stand_id` do client nesse contexto.
- Logs de auditoria são append-only na camada de aplicação.
- O link dá acesso operacional limitado (ver ocupação, cadastrar, excluir do próprio stand) — não expõe dados de outros stands nem funções administrativas.
- Headers de no-cache nas páginas do painel (`Cache-Control: no-store`) para evitar vazamento via cache compartilhado.

## 4. Fases de implementação (executar em ordem, commit por fase)

1. **Fase 1 — Banco**: migrations (1.1 a 1.4). Rodar contra branch de dev do Neon primeiro.
2. **Fase 2 — Geração/revogação de token + e-mail**: painel admin, integração Resend, logs TOKEN_GERADO/REVOGADO.
3. **Fase 3 — Painel do responsável**: rota `/stand/[token]`, validação, ocupação, lista de credenciados.
4. **Fase 4 — Cadastro via token**: mover formulário, remover lista pública, validação de vagas com transação.
5. **Fase 5 — Exclusão com auditoria**: server action, limpeza de biometria, remoção iVMS, logs.
6. **Fase 6 — Auditoria no admin + testes**: página de logs, testes dos fluxos críticos (token revogado, stand lotado, corrida de vagas, exclusão).

## 5. Critérios de aceite

- [ ] Página pública não lista mais stands.
- [ ] Responsável acessa via link e vê apenas seu stand.
- [ ] Link revogado retorna erro genérico sem vazar existência do stand.
- [ ] Cadastro respeita `limite_vagas` mesmo sob requisições simultâneas.
- [ ] Exclusão libera vaga, apaga biometria, registra log completo (ator, alvo, motivo, ip, timestamp) e remove face do iVMS (ou enfileira).
- [ ] Admin consegue gerar, revogar e reenviar links e consultar auditoria.
- [ ] Nenhuma resposta de API do contexto `/stand/[token]` contém dados de outros stands.

## Perguntas a resolver antes de codar (responder ao iniciar)

1. Qual o nome real das tabelas de stands e credenciados no schema atual? Mapear antes das migrations.
2. Já existe serviço de e-mail configurado no projeto? Se não, instalar e configurar Resend com domínio megacredenciamento.com.br.
3. O `limite_vagas` por stand já existe em alguma forma hoje? Migrar o dado existente.
4. A remoção de face via ISAPI já está implementada ou só o cadastro? Se só cadastro, implementar endpoint de remoção.
