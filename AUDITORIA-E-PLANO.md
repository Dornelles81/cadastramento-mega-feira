# Auditoria Técnica e Plano de Ação — Mega Feira Credenciamento

> **STATUS (10/06/2026): Fase 1 (Segurança crítica) IMPLEMENTADA no código.**
> Pendências operacionais antes do deploy:
> 1. Configurar env vars em produção: `MASTER_KEY` (32+ chars), `NEXTAUTH_SECRET`, `CRON_SECRET`, `HIKVISION_PASSWORD`, `HIKCENTAL_PASSWORD`, `HIKCENTRAL_WEB_USER/PASSWORD` (sem fallbacks no código).
> 2. Fazer backup/branch do Neon e rodar `npx tsx scripts/encrypt-legacy-faces.ts --dry-run` e depois sem `--dry-run` para criptografar as fotos legadas em plaintext.
> 3. Garantir que todos os operadores de portaria tenham usuário NextAuth (role `OPERATOR`) — os endpoints de check-in agora exigem login.

**Data:** 10/06/2026
**Escopo:** Arquitetura, rotas, modelos (Neon/Prisma), autenticação, UX, performance e segurança.
**Método:** Análise estática do código (nenhum arquivo foi modificado).

---

## 1. Arquitetura Atual

### 1.1 Stack real (difere do CLAUDE.md)

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | **Next.js 16** (híbrido App Router + Pages Router) | CLAUDE.md diz "Next.js 14" — desatualizado |
| UI | React 19 + Tailwind 3 + Framer Motion | |
| Banco | Neon PostgreSQL + Prisma 5 | `DATABASE_URL` + `DIRECT_URL` |
| Auth | NextAuth v4 (JWT) **+ 2 sistemas legados paralelos** | Ver §2 |
| Biometria | MediaPipe (client) + Azure Face API | Qualidade às vezes simulada |
| Integrações | Hikvision ISAPI (digest/HTTP), HikCentral (5 clientes experimentais), WhatsApp Evolution, OCR (serviço Python em `ocr-service/`) | |
| Uploads | Filesystem local (`uploads/`, `public/uploads/`) | **Incompatível com Vercel serverless** (FS efêmero) |
| Deploy | Vercel | `typescript.ignoreBuildErrors: true` |

### 1.2 Rotas de API (~95 endpoints)

- **App Router (2):** `app/api/admin/document-config`, `app/api/public/document-fields`
- **Pages Router (~93):** agrupados em `admin/` (40+), `hikvision/` + `hikcental/` + `hikcentral/` (15 — três grafias para a mesma integração), `access/` (10), `public/`, `export/`, `participants/`, além de soltos (`register.ts`, `register-fixed.ts`, `register-dev.ts`, `upload.ts`, `participant-image.ts`…)
- **Endpoints de teste/debug expostos em produção:** `test-prisma`, `debug-documents`, `add-test-photos`, `register-dev`, `health-dev`, `hikcentral/discover-api`, `hikcentral/test-all-methods`, `hikcentral/test-optimus`, e ~12 HTMLs administrativos em `public/` (`extract-photos.html`, `sync-hikcentral.html` etc.) servidos publicamente.

### 1.3 Modelos no Neon (17 tabelas)

- **Núcleo multi-tenant:** `Event` → `Participant`, `Stand`, `CustomField`, `DocumentConfig`, `EventConfig`
- **Auth/RBAC:** `EventAdmin`, `EventAdminAccess` (7 permissões granulares por evento)
- **Auditoria:** `AuditLog`, `ApprovalLog`
- **HikCentral:** `HikCentralConfig`, `HikCentralSyncLog`, `HikCentralSyncBatch`, `HikCentralWebhookLog`
- **Controle de acesso:** `AccessLog`, `AccessStats`, `VehicleCredential`, `VehicleAccessLog`

Pontos estruturais: índices bem desenhados; porém `Participant.eventId` e `Stand.eventId` ainda opcionais ("temporarily for migration"), `@@unique([eventId, code])` de Stand **desabilitado**, e campos legados (`eventCode`) duplicando a FK.

### 1.4 Fluxos de autenticação — existem TRÊS em paralelo

1. **NextAuth (correto):** Credentials + bcrypt + JWT 24h, lockout após 5 tentativas, audit log. `middleware.ts` protege **apenas páginas** `/admin/*` — **não protege nenhuma API**. ~20 endpoints usam `getServerSession`/`requireAuth`.
2. **Token legado (`/api/admin/auth.ts`):** SHA-256 de `timestamp + SECRET_KEY` — determinístico, igual para todos os usuários, sem revogação, com segredo e senha padrão hardcoded (`megafeira2025`). Usado por ~11 endpoints.
3. **`Bearer <ADMIN_PASSWORD>` (pior):** a **senha em texto puro** é o token, default `admin123`, armazenada em `localStorage` e hardcoded como fallback no frontend (`app/admin/stands/page.tsx` etc.). Usado por `admin/participants.ts`, `approve-participant.ts` e outros.
4. **Sem nenhuma autenticação:** `hikvision/sync.ts` (e demais hikvision/hikcental), todos os `access/*` (check-in/out), `participant-image.ts`, `upload.ts`, `uploads/[filename].ts`, `export/*`, `participants/*`.

---

## 2. Frente 1 — SEGURANÇA (prioridade máxima)

### 🔴 Críticos

| # | Achado | Local | Risco |
|---|---|---|---|
| S1 | **Biometria NÃO está criptografada.** `register-fixed.ts` grava a foto facial completa em base64 plaintext (`faceImageUrl`) e o "criptografado" (`faceData`) é um **hash SHA-256** — irreversível, não é criptografia. No `register.ts`, `crypto.createCipher` (deprecated) **ignora o IV gerado** e deriva chave por EVP_BytesToKey; `MASTER_KEY` tem fallback hardcoded. | `pages/api/register-fixed.ts:45-48,300-318`, `pages/api/register.ts:41-53` | Vazamento do banco = vazamento de dado biométrico sensível (LGPD art. 5º II, art. 11). Alegação de "AES-256" na documentação não corresponde à realidade. |
| S2 | **Foto facial de qualquer participante exposta sem auth** via `GET /api/participant-image?id=<uuid>`. | `pages/api/participant-image.ts` | Exposição de dado biométrico a qualquer pessoa com o ID. |
| S3 | **Endpoints administrativos e de sincronização sem nenhuma auth:** disparo de sync Hikvision, check-in/out, exports. | `pages/api/hikvision/*`, `access/*`, `export/*` | Qualquer um pode cadastrar/remover faces nos terminais físicos. |
| S4 | **Senha como bearer token** (`Bearer admin123` default), em `localStorage`, hardcoded no frontend. | `pages/api/admin/participants.ts:18`, `approve-participant.ts:17`, `app/admin/stands/page.tsx:88` | Acesso admin trivial em produção se env não definida; XSS rouba a senha real. |
| S5 | **Senha logada em texto puro no console** (`providedPassword`, `expectedPassword`) e **corpo completo do cadastro (CPF + foto base64) logado**. | `pages/api/admin/auth.ts:44-52`, `register*.ts:65,82` | Vazamento via logs da Vercel. |
| S6 | **Upload irrestrito sem auth:** 50MB, qualquer MIME/extensão, nome previsível; servido de volta sem auth por `uploads/[filename].ts` (com risco de path traversal via separador codificado). | `pages/api/upload.ts`, `pages/api/uploads/[filename].ts` | Hospedagem de malware, acesso a documentos (RG/CNH) de terceiros. |
| S7 | **Segredos com fallback hardcoded:** `NEXTAUTH_SECRET` (`'mega-feira-secret-change-in-production'`), `SECRET_KEY`, `MASTER_KEY`, `ADMIN_PASSWORD`. | `[...nextauth].ts:177`, `admin/auth.ts:5-7` | Forja de JWT/sessão se env faltar. |

### 🟠 Altos

- **S8 — LGPD: retenção nunca aplicada.** `retentionDate` existe no schema mas **nenhum código** o preenche ou executa expurgo; não há endpoint de exclusão/anonimização a pedido do titular.
- **S9 — CORS `*`** em endpoints sensíveis, incluindo admin.
- **S10 — Sem rate limiting** em `register*`, `admin/auth` (brute-force livre no fluxo legado) e check-in.
- **S11 — Endpoints de debug/test e HTMLs administrativos públicos** (`add-test-photos`, `extract-photos.html`…).
- **S12 — `ignoreBuildErrors: true`** mascara erros de tipo que podem virar falhas de segurança.
- **S13 — Hikvision via HTTP puro** (credenciais digest trafegam em rede local sem TLS); `rejectUnauthorized: false` em dev.
- **S14 — Sem CSP**; headers básicos OK (X-Frame-Options, nosniff), mas falta `Content-Security-Policy` e `Strict-Transport-Security`.

### Plano de remediação (Fase 1 — antes de qualquer outra frente)

1. **Unificar auth em NextAuth** (1 sprint):
   - Criar wrapper `withApiAuth(handler, { permission })` e aplicar a **todos** os endpoints `admin/*`, `hikvision/*`, `hikcental/*`, `access/*`, `export/*`.
   - Adicionar role `OPERATOR` real para check-in (já existe no middleware, não no schema).
   - Remover `pages/api/admin/auth.ts`, o esquema `Bearer ADMIN_PASSWORD` e todo uso de `localStorage.adminPassword`.
   - Remover fallbacks de segredos: app deve **falhar no boot** se `NEXTAUTH_SECRET`/`MASTER_KEY` ausentes.
2. **Criptografia real da biometria** (1 sprint):
   - AES-256-GCM com `createCipheriv`, IV aleatório + auth tag, chave via env (e plano de rotação).
   - Migrar `faceImageUrl` base64 → armazenamento de objeto (Vercel Blob ou S3) com URL assinada; **migração de dados** para criptografar o legado plaintext.
   - `participant-image` passa a exigir sessão + permissão no evento.
3. **Uploads:** exigir auth, validar MIME real (magic bytes), allowlist de extensões, nome aleatório (UUID), mover para storage de objeto com URL assinada e expiração.
4. **Higiene:** remover todos os `console.log` com PII/senhas; remover endpoints `*-dev`, `test-*`, `debug-*` e HTMLs de `public/`; restringir CORS à origem do app; adicionar CSP + HSTS; rate limiting (Upstash/Vercel KV) em register e login.
5. **LGPD:** job (Vercel Cron) de expurgo por `retentionDate`; setar `retentionDate = evento.endDate + 90d` no cadastro; endpoint de exclusão por titular; registrar tudo em `AuditLog`.

---

## 3. Frente 2 — PERFORMANCE

| # | Achado | Impacto | Ação proposta |
|---|---|---|---|
| P1 | **Foto base64 na linha do participante** (`faceImageUrl` com data URL inteiro). Listagens admin **selecionam esse campo** (`admin/participants.ts:70`). | Respostas de listagem com dezenas de MB; estouro de memória/timeout em serverless; queries lentas no Neon. | Mover imagens para storage de objeto (mesma ação de S1); listagens retornam só URL/flag. Maior ganho único de performance do sistema. |
| P2 | `participants-full` **sem limite** (limite de 100 removido no commit `8200ba1`). | Com 2.000 participantes × foto base64 → resposta gigante. | Paginação obrigatória + remoção do base64 (P1). |
| P3 | **Cache em memória inútil na Vercel** (`lib/cache.ts` — cada invocação lambda tem instância própria; `setInterval` não roda de forma confiável). | Falsa sensação de cache; hit rate ~0 em produção. | Substituir por cache HTTP (`s-maxage`/`stale-while-revalidate`) para dados públicos e/ou Vercel KV. |
| P4 | **JWT de sessão carrega todos os eventos + counts + 7 permissões cada.** | Cookie pode estourar 4KB com vários eventos → login quebra silenciosamente; counts ficam obsoletos na sessão. | Guardar no token só `id`/`role`; buscar permissões por request (com cache curto). |
| P5 | `Event.currentCount`/`Stand.currentCount` mantidos manualmente em paralelo a `_count`. | Drift de contadores (já há heurísticas de recontagem espalhadas). | Padronizar em `_count`/queries agregadas; remover colunas ou tratá-las como cache reconstruível. |
| P6 | **Componentes monolíticos enormes** (página de evento admin com 92KB; 5 variantes de FaceCapture; `page-backup.tsx` no bundle). | Bundle mobile pesado, TTI alto em 4G — público-alvo é smartphone. | Code-splitting (`dynamic()`), consolidar captura facial em 1 componente, deletar backups/variantes mortas. |
| P7 | **Dependências duplicadas:** `bcrypt` + `bcryptjs`, `axios` + fetch nativo, `jspdf` + `xlsx` no client. | Build maior, cold start maior. | Manter só `bcryptjs` (serverless-safe), padronizar fetch, carregar jspdf/xlsx sob demanda. |
| P8 | Exports XLSX/ZIP síncronos em função serverless. | Timeout com 2.000 registros. | Streaming ou geração paginada; para volumes grandes, job assíncrono. |

**Positivo:** índices do Prisma bem planejados (compostos por evento/status, `createdAt DESC`); `lib/prisma.ts` com singleton correto.

### Plano (Fase 2)

1. Migração de imagens para storage de objeto + backfill (depende da Fase 1, item 2).
2. Paginação obrigatória em todas as listagens; revisar `select` de cada endpoint.
3. Sessão enxuta (P4) e remoção do cache em memória (P3).
4. Diet do bundle: consolidação de componentes, dynamic imports, limpeza de deps.

---

## 4. Frente 3 — EXPERIÊNCIA DO USUÁRIO

| # | Achado | Ação proposta |
|---|---|---|
| U1 | **Dois fluxos de login admin diferentes** (`/admin/login` NextAuth e `/admin/fields/login` por senha compartilhada) — confuso e inseguro. | Um único login (resolvido junto com S4/Fase 1). |
| U2 | **5 componentes de captura facial** (`FaceCapture`, `SimpleFaceCapture`, `MediaPipeFaceCapture`, `EnhancedFaceCapture`, `UniversalFaceCapture`, `DesktopFaceCapture`) → comportamento inconsistente entre eventos/telas. | Consolidar em um componente com fallbacks (MediaPipe → captura simples), testado em iOS Safari e Android Chrome. |
| U3 | **Qualidade facial simulada** (`Math.random()` em `register.ts:123`; fallback 0.5 no `register-fixed`). Operador aprova/reprova com base em número falso. | Usar score real (MediaPipe/Azure) ou não exibir; validar qualidade no client antes do envio (nitidez, iluminação, enquadramento). |
| U4 | **Mensagens de erro mistas PT/EN** ("Invalid data", "Method not allowed" vs. "CPF inválido"). | Padronizar todas as mensagens voltadas ao usuário em pt-BR, com orientação de correção. |
| U5 | **Sem feedback de progresso** no envio da foto/cadastro (payload base64 grande em 4G pode demorar >10s). | Indicador de progresso de upload, retry automático, e compressão da imagem no client antes do envio. |
| U6 | **PWA incompleto:** `manifest.json` existe, mas sem service worker → sem offline/instalação real, apesar do contexto de feira (rede ruim). | Service worker com fila offline para check-in (cenário portaria) e cache de assets. |
| U7 | **Duplicidade de CPF só detectada no submit final**, depois de o usuário preencher tudo e tirar foto. | Verificação de CPF no primeiro passo (com debounce), antes da captura facial. |
| U8 | Páginas admin gigantes sem estados de carregamento/erro consistentes; contadores podem divergir (P5). | Componentizar, adicionar skeletons e estados vazios; fonte única de contagem. |
| U9 | Acessibilidade não tratada (sem labels/aria consistentes nos formulários dinâmicos). | Passada de a11y nos formulários públicos (são a porta de entrada de 2.000 pessoas). |

### Plano (Fase 3)

1. Consolidação do fluxo de cadastro: CPF primeiro (U7) → dados → captura unificada (U2) com compressão + progresso (U5) → sucesso com QR.
2. Padronização de mensagens pt-BR (U4) e estados de loading/erro (U8).
3. Service worker para check-in offline (U6) — alto valor para a portaria.

---

## 5. Roadmap consolidado

| Fase | Conteúdo | Dependências | Estimativa |
|---|---|---|---|
| **1 — Segurança crítica** | Auth unificada em todos os endpoints; criptografia AES-GCM real + migração de dados; uploads seguros; remoção de segredos default, logs com PII, endpoints de debug; CORS/CSP; rate limiting; cron LGPD | — | 2–3 sprints |
| **2 — Performance** | Storage de objeto p/ imagens + backfill; paginação universal; sessão enxuta; cache correto; diet de bundle/deps | Fase 1 (storage e auth) | 1–2 sprints |
| **3 — UX** | Captura facial unificada; CPF antecipado; progresso/compressão; i18n pt-BR; offline check-in | Fase 2 (imagens) | 1–2 sprints |
| **4 — Dívida técnica** | Migrar Pages Router → App Router gradualmente; consolidar 3 grafias de HikCentral em 1 cliente; tornar `eventId` obrigatório + reativar unique de Stand; reativar checagem de tipos no build; atualizar CLAUDE.md | Fases 1–3 | contínuo |

### Riscos da migração

- **Criptografar biometria legada** exige script de migração com janela de manutenção e backup prévio do Neon.
- **Unificar auth pode quebrar telas admin** que hoje usam `localStorage.adminPassword` — mapear todas antes (grep por `adminPassword`/`adminFieldsAuth`).
- **Mover imagens do banco** muda contrato de ~10 endpoints e telas de listagem; fazer com flag de transição (servir de ambos até o backfill terminar).
- Sincronização Hikvision em produção: testar em terminal de homologação antes de tocar nos clientes ISAPI.

---

*Documento gerado por auditoria automatizada (somente leitura). Nenhum arquivo de código foi alterado.*
