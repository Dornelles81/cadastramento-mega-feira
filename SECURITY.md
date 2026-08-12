# 🔐 Autenticação e Controle de Acesso

## Visão Geral

O painel administrativo (`/admin/*`) é protegido por **NextAuth com contas
individuais** gravadas na tabela `EventAdmin`. Não existe senha compartilhada,
não existe token de portador em `sessionStorage` e nenhum segredo é lido do
código ou de variável de senha.

> **Histórico.** Este documento descrevia até 2026-08 um esquema anterior:
> login por senha única em `/admin/fields/login`, token SHA-256 em
> `sessionStorage` e as variáveis `ADMIN_PASSWORD`/`SECRET_KEY`. **Esse esquema
> não existe mais** — a página, o endpoint `/api/admin/auth` e as duas
> variáveis foram removidos. Se algum guia antigo pedir para configurar
> `ADMIN_PASSWORD` ou `SECRET_KEY`, ignore: elas não são lidas por nenhuma
> linha de código e reintroduzi-las só recria exposição.

## Como funciona

### 1. Login

- **URL**: `/admin/login`
- **Credenciais**: e-mail + senha por usuário, em `EventAdmin`
- **Verificação**: `bcrypt.compare` contra o hash (`pages/api/auth/[...nextauth].ts`)
- **Normalização**: o e-mail é comparado com `trim`/`lowercase` e
  case-insensitive — teclado de celular capitaliza a primeira letra
- **Sessão**: JWT, validade de 24 h
- **Proteção contra força bruta**: 5 tentativas falhas bloqueiam a conta por
  15 minutos (`loginAttempts` / `lockedUntil`)

### 2. Proteção das rotas do painel

`middleware.ts` aplica `withAuth` ao matcher `/admin/:path*`: sem sessão, o
acesso é redirecionado para `/admin/login`. Contas com role `OPERATOR` são
confinadas a `/admin/access-control`.

### 3. Proteção das APIs

| Router | Helper | Onde |
|---|---|---|
| Pages (`pages/api/**`) | `withApiAuth(handler, { roles })` | `lib/api-auth.ts` |
| Pages (alternativo) | `requireAuth` / `isSuperAdmin` | `lib/auth.ts` |
| App (`app/api/**`) | `getServerSession` + checagem de role | ver `document-config/route.ts` |

Ambos leem **apenas o cookie de sessão do NextAuth**. Header `Authorization`
não é consultado em nenhum endpoint administrativo — se encontrar código
cliente mandando `Bearer <algo>` para uma rota admin, é resíduo e pode sair.

**A lista de roles é fonte única**: `ADMIN_ROLES` e `OPERATOR_ROLES` em
`lib/api-auth.ts`. Não redeclare a lista localmente — uma cópia divergente já
trancou contas `ADMIN` fora da configuração de documentos.

### 4. Papéis

| Role | Alcance |
|---|---|
| `SUPER_ADMIN` | Tudo, em todos os eventos |
| `ADMIN` | Administração; role da maioria das contas reais |
| `EVENT_ADMIN` | Restrito aos eventos vinculados, com permissões granulares |
| `OPERATOR` | Só `/admin/access-control` (portaria) |

Permissões por evento (`canView`, `canEdit`, `canApprove`, `canDelete`,
`canExport`, `canManageStands`, `canManageAdmins`) são avaliadas por
`hasEventPermission` (`lib/api-auth.ts`) e `checkEventAccess` (`lib/auth.ts`).

## Variáveis de ambiente relevantes

```env
NEXTAUTH_SECRET=<segredo-forte-aleatorio>   # OBRIGATÓRIA — sem fallback
NEXTAUTH_URL=<url-publica-da-aplicacao>
MASTER_KEY=<32+ caracteres>                 # AES-256-GCM dos dados biométricos
```

`NEXTAUTH_SECRET` **não tem valor padrão**: sem ela a aplicação falha em vez de
assinar sessão com segredo público. Confirme que existe no ambiente de
produção antes de qualquer deploy.

## Gerenciamento de contas

- **Criar/editar/desativar**: pela tabela `EventAdmin` (`isActive`), ou pela
  administração de admins do painel.
- **Revogar acesso**: marque `isActive=false`. A sessão JWT em curso expira em
  até 24 h.
- **Diagnóstico**: `npx tsx scripts/check-admin.ts <email> [senha]` lista as
  contas (role, ativo, tentativas, bloqueio) e testa uma senha contra o hash.
  É somente-leitura: não faz login nem incrementa `loginAttempts`.

## Recursos implementados

- Senhas com hash **bcrypt**, uma conta por pessoa
- Sessão JWT de 24 h assinada com `NEXTAUTH_SECRET`
- Bloqueio por força bruta (5 tentativas → 15 min)
- Middleware cobrindo todo `/admin/*` e confinamento de `OPERATOR`
- Autorização por role e por evento nas APIs
- Documentos e biometria cifrados em repouso (AES-256-GCM, `MASTER_KEY`)
- Rate limit em endpoints públicos de upload e detecção facial
- `AuditLog` sem cópia de biometria no hard delete

## Recomendações em aberto

- 2FA para `SUPER_ADMIN`
- Alertas para múltiplas falhas de login
- Revisão periódica de contas com `isActive=true`

## Reportando um problema de segurança

1. Não exponha detalhes publicamente
2. Contate o administrador do sistema
3. Documente o incidente
