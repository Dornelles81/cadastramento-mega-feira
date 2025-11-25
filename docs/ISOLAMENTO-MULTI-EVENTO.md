# Sistema de Isolamento Multi-Evento

## Visão Geral

O sistema agora implementa **isolamento completo de dados entre eventos**. Cada administrador só pode ver e gerenciar participantes dos eventos aos quais foi atribuído.

## Arquitetura de Segurança

### 1. Autenticação via NextAuth

**Localização**: `lib/auth.ts`, `pages/api/auth/[...nextauth].ts`

O sistema usa NextAuth para autenticação robusta com dois níveis de permissão:

#### Super Admin
- Acesso total a todos os eventos
- Pode criar novos eventos
- Pode criar e gerenciar outros administradores
- Role: `SUPER_ADMIN`

#### Admin Regular
- Acesso apenas aos eventos atribuídos
- Permissões granulares por evento:
  - `canView`: Ver participantes
  - `canEdit`: Editar dados
  - `canApprove`: Aprovar/rejeitar
  - `canDelete`: Excluir registros
  - `canExport`: Exportar dados
  - `canManageStands`: Gerenciar estandes
  - `canManageAdmins`: Gerenciar admins do evento

### 2. Fluxo de Isolamento

```
┌─────────────┐
│   Admin     │
│   Login     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  NextAuth Session   │
│  + Event Access     │
│  + Permissions      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Dashboard         │
│  /admin/dashboard   │
│  Lista só eventos   │
│  acessíveis         │
└──────┬──────────────┘
       │
       ▼
┌────────────────────────────┐
│  Event Dashboard           │
│  /admin/eventos/[slug]/... │
│  API filtered by eventId   │
└────────────────────────────┘
```

---

## APIs Protegidas

### API Event-Specific (Recomendada)

**`GET /api/admin/eventos/[slug]/participantes`**

```typescript
// Security check
const { session, event, admin } = await requireEventAccess(
  req, res, slug, 'canView'
)

// Only returns participants from THIS event
const participants = await prisma.participant.findMany({
  where: {
    eventId: event.id // ← CRITICAL FILTER
  }
})
```

**Características**:
- ✅ Autenticação obrigatória (NextAuth)
- ✅ Verificação de permissão por evento
- ✅ Filtragem automática por `eventId`
- ✅ Logs de auditoria

### API General (Legacy - Agora Protegida)

**`GET /api/admin/participants-full`**

```typescript
// NEW: Authentication required
const session = await requireAuth(req, res)

// NEW: Filter by accessible events
const eventIds = isSuperAdmin(session)
  ? await getAllEventIds()
  : session.user.events.map(e => e.id)

// NEW: Query filter
const participants = await prisma.participant.findMany({
  where: {
    eventId: { in: eventIds } // ← EVENT ISOLATION
  }
})
```

**Mudanças implementadas**:
- ✅ Agora requer autenticação NextAuth
- ✅ Filtra por eventos acessíveis
- ✅ Super Admin vê todos / Admin Regular vê apenas seus eventos

---

## Páginas Admin

### 🎯 Dashboard Principal (Recomendado)

**URL**: `/admin/dashboard`

**Características**:
- ✅ NextAuth authentication
- ✅ Lista apenas eventos acessíveis
- ✅ Botão para acessar dashboard específico de cada evento
- ✅ Estatísticas por evento
- ✅ Links diretos para URL pública, campos, exportação

**Como Funciona**:
```typescript
// 1. Check session
const { data: session } = useSession()

// 2. Load accessible events
const events = isSuperAdmin(session)
  ? await fetchAllEvents()
  : session.user.events

// 3. Show event cards
{events.map(event => (
  <EventCard
    event={event}
    onClick={() => router.push(`/admin/eventos/${event.slug}/participantes`)}
  />
))}
```

### 📊 Event-Specific Dashboard

**URL**: `/admin/eventos/[slug]/participantes`

**Características**:
- ✅ Mostra APENAS participantes do evento específico
- ✅ Verificação de permissão no backend
- ✅ URL única por evento
- ✅ Isolamento garantido pela API

**Exemplo de Uso**:
```
Mega Feira: /admin/eventos/mega-feira-2025/participantes
Expofest:   /admin/eventos/expofest-2026/participantes
```

### ⚠️ Admin Page Legacy

**URL**: `/admin`

**Status**: **DEPRECATED - Redirects to /admin/dashboard**

Esta página antiga foi desativada e agora redireciona automaticamente para `/admin/dashboard`.

---

## Como Funciona o Isolamento

### Cenário 1: Admin Regular com 1 Evento

```json
{
  "user": {
    "id": "admin-123",
    "name": "João Silva",
    "role": "ADMIN",
    "events": [
      {
        "id": "event-mega-feira",
        "slug": "mega-feira-2025",
        "name": "Mega Feira 2025",
        "permissions": {
          "canView": true,
          "canEdit": true,
          "canApprove": true
        }
      }
    ]
  }
}
```

**Resultado**:
- Dashboard mostra apenas "Mega Feira 2025"
- API retorna apenas participantes com `eventId = "event-mega-feira"`
- Não vê participantes de Expofest ou outros eventos

### Cenário 2: Admin Regular com Múltiplos Eventos

```json
{
  "user": {
    "id": "admin-456",
    "name": "Maria Santos",
    "role": "ADMIN",
    "events": [
      {
        "id": "event-mega-feira",
        "slug": "mega-feira-2025",
        "permissions": { "canView": true }
      },
      {
        "id": "event-expofest",
        "slug": "expofest-2026",
        "permissions": { "canView": true, "canEdit": true }
      }
    ]
  }
}
```

**Resultado**:
- Dashboard mostra "Mega Feira 2025" e "Expofest 2026"
- API retorna participantes de ambos eventos
- Permissões diferentes por evento

### Cenário 3: Super Admin

```json
{
  "user": {
    "id": "super-admin-1",
    "name": "Admin Master",
    "role": "SUPER_ADMIN"
  }
}
```

**Resultado**:
- Dashboard mostra TODOS os eventos
- API retorna participantes de TODOS os eventos
- Acesso completo sem restrições

---

## Testando o Isolamento

### Teste 1: Verificar API

```bash
# 1. Login como Admin da Mega Feira
curl http://localhost:3000/api/admin/eventos/mega-feira-2025/participantes \
  -H "Cookie: next-auth.session-token=..."

# Deve retornar apenas participantes da Mega Feira

# 2. Tentar acessar Expofest (deve falhar)
curl http://localhost:3000/api/admin/eventos/expofest-2026/participantes \
  -H "Cookie: next-auth.session-token=..."

# Deve retornar erro 403: Sem permissão
```

### Teste 2: Verificar Dashboard

1. **Login como Admin Mega Feira**
   - Acessar: `http://localhost:3000/admin/login`
   - Login com credenciais de admin da Mega Feira
   - Dashboard deve mostrar apenas "Mega Feira 2025"

2. **Login como Admin Expofest**
   - Acessar: `http://localhost:3000/admin/login`
   - Login com credenciais de admin da Expofest
   - Dashboard deve mostrar apenas "Expofest 2026"

3. **Login como Super Admin**
   - Dashboard deve mostrar todos os eventos
   - Botão "Criar Novo Evento" visível

### Teste 3: Logs de Auditoria

```bash
# Verificar logs no banco de dados
node -e "
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

prisma.auditLog.findMany({
  where: { action: 'VIEW_PARTICIPANTS' },
  orderBy: { createdAt: 'desc' },
  take: 10
}).then(logs => console.log(logs))
"
```

---

## Bibliotecas de Segurança

### `lib/auth.ts` - Funções Principais

#### 1. `requireAuth(req, res)`
Garante que o usuário está autenticado.

```typescript
const session = await requireAuth(req, res)
// Throws error if not authenticated
```

#### 2. `requireEventAccess(req, res, slug, permission)`
Garante acesso ao evento com permissão específica.

```typescript
const { session, event, admin } = await requireEventAccess(
  req, res, 'mega-feira-2025', 'canEdit'
)
// Throws error if no access or missing permission
```

#### 3. `checkEventAccess(session, slug, permission)`
Verifica se usuário tem acesso ao evento.

```typescript
const hasAccess = await checkEventAccess(session, 'mega-feira-2025', 'canView')
// Returns boolean
```

#### 4. `isSuperAdmin(session)`
Verifica se é super admin.

```typescript
if (isSuperAdmin(session)) {
  // Super admin logic
}
```

#### 5. `createAuditLog(data)`
Cria log de auditoria.

```typescript
await createAuditLog({
  adminId: admin.id,
  eventId: event.id,
  action: 'VIEW_PARTICIPANTS',
  entityType: 'participant',
  description: `Admin visualizou participantes`,
  severity: 'INFO'
})
```

---

## Estrutura do Banco de Dados

### Modelo Event

```prisma
model Event {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  code        String   @unique
  isActive    Boolean  @default(true)

  participants Participant[]
  admins       AdminEvent[]
}
```

### Modelo Participant

```prisma
model Participant {
  id        String   @id @default(cuid())
  eventId   String   // ← CRITICAL: Links to Event
  event     Event    @relation(fields: [eventId], references: [id])

  name      String
  cpf       String
  // ... other fields
}
```

### Modelo AdminEvent (Join Table)

```prisma
model AdminEvent {
  id          String   @id @default(cuid())
  adminId     String
  eventId     String

  // Permissions
  canView     Boolean  @default(true)
  canEdit     Boolean  @default(false)
  canApprove  Boolean  @default(false)
  canDelete   Boolean  @default(false)
  canExport   Boolean  @default(true)

  admin       Admin    @relation(fields: [adminId], references: [id])
  event       Event    @relation(fields: [eventId], references: [id])

  @@unique([adminId, eventId])
}
```

---

## URLs do Sistema

### Públicas (Cadastro)
```
Mega Feira: http://localhost:3000/?event=mega-feira-2025
Expofest:   http://localhost:3000/?event=expofest-2026
```

### Admin - Dashboard Principal
```
Login:      http://localhost:3000/admin/login
Dashboard:  http://localhost:3000/admin/dashboard
```

### Admin - Event Dashboards
```
Mega Feira: http://localhost:3000/admin/eventos/mega-feira-2025/participantes
Expofest:   http://localhost:3000/admin/eventos/expofest-2026/participantes
```

### Admin - Gerenciamento
```
Campos:     http://localhost:3000/admin/eventos/[slug]/campos
Documentos: http://localhost:3000/admin/documents
Estandes:   http://localhost:3000/admin/stands
Logs:       http://localhost:3000/admin/logs
```

### Super Admin - Exclusivo
```
Criar Evento: http://localhost:3000/admin/super/eventos/novo
Admins:       http://localhost:3000/admin/super/admins
Logs Globais: http://localhost:3000/admin/super/logs
```

---

## Troubleshooting

### Problema: Admin vê participantes de outros eventos

**Sintoma**: Admin da Mega Feira vê participantes da Expofest

**Causa Possível**:
1. Usando página `/admin` antiga (agora redireciona)
2. API não está filtrando corretamente
3. Permissões incorretas no banco

**Solução**:
1. Verificar que está usando `/admin/dashboard`
2. Verificar logs da API: `console.log` mostra eventos acessíveis
3. Verificar permissões no banco:
```sql
SELECT * FROM AdminEvent WHERE adminId = 'admin-id';
```

### Problema: Erro 403 ao acessar evento

**Sintoma**: "Sem permissão: canView"

**Causa**: Admin não tem permissão para o evento

**Solução**:
1. Super Admin deve atribuir permissões via `/admin/super/admins`
2. Ou adicionar manualmente no banco:
```sql
INSERT INTO AdminEvent (adminId, eventId, canView)
VALUES ('admin-id', 'event-id', true);
```

### Problema: API retorna todos participantes

**Sintoma**: Super admin vê todos, mas admin regular também vê

**Causa**: API não está usando autenticação

**Solução**:
- Verificar que API está usando `requireAuth()` ou `requireEventAccess()`
- Verificar logs: deve mostrar "Regular Admin: Access to events [...]"

---

## Best Practices

### ✅ DO

1. **Sempre use `/admin/dashboard`** como ponto de entrada
2. **Use APIs event-specific** quando possível
3. **Verifique logs** após mudanças de permissão
4. **Teste isolamento** antes de deploy
5. **Use `requireEventAccess()`** em APIs novas

### ❌ DON'T

1. **Não use `/admin`** (deprecated, redireciona)
2. **Não faça queries** diretas sem filtro `eventId`
3. **Não assuma** que usuário é super admin
4. **Não pule** verificação de autenticação
5. **Não use** password simples (use NextAuth)

---

## Changelog

### 2025-01-17 - Implementação Multi-Evento

**Mudanças**:
1. ✅ Adicionado filtro de eventos em `/api/admin/participants-full`
2. ✅ Implementado `requireAuth()` em APIs legacy
3. ✅ Adicionado redirect de `/admin` para `/admin/dashboard`
4. ✅ Documentação completa do sistema de isolamento

**Breaking Changes**:
- `/admin/participants-full` agora requer autenticação NextAuth
- `/admin` redireciona para `/admin/dashboard`

**Migration Guide**:
- Admins devem usar `/admin/dashboard` como entrada principal
- APIs devem usar `requireAuth()` ou `requireEventAccess()`
- Testar isolamento após atualização

---

## Referências

- NextAuth Docs: https://next-auth.js.org
- Prisma Relations: https://www.prisma.io/docs/concepts/components/prisma-schema/relations
- `lib/auth.ts` - Funções de autenticação
- `pages/api/admin/eventos/[slug]/participantes.ts` - Exemplo de API protegida
