# Multi-Event Architecture Documentation

## 📋 Overview

This document describes the complete multi-event architecture for the Facial Registration System, transforming it from a single-event application to a multi-tenant platform capable of managing multiple independent events.

**Version:** 1.0.0
**Date:** 2025-11-15
**Status:** ✅ Schema Implemented - Ready for Migration

---

## 🎯 Business Requirements

### Current Limitation
- System currently supports only **one event** (MEGA-FEIRA-2025)
- All participants are stored in a single pool
- No event isolation or multi-tenancy

### New Requirements
1. **Multiple Independent Events**: Support unlimited concurrent events
2. **Data Isolation**: Complete separation of participant data between events
3. **Separate Access Control**: Different administrators for different events
4. **Event-Specific Configuration**: Custom fields, documents, branding per event
5. **URL-Based Access**: Each event has unique public registration URL
6. **Backward Compatibility**: Existing data must be preserved and migrated

---

## 🏗️ Architecture Design

### 1. Multi-Tenant Strategy

**Approach Chosen:** Path-based Multi-Tenancy with Database-Level Isolation

```
Pattern: /evento/[slug]
Example: /evento/mega-feira-2025
         /evento/expointer-2025
         /evento/freio-de-ouro-2025
```

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| Path-based routing | SEO-friendly, shareable URLs, no subdomain complexity |
| Single database | Simplified deployment, easier queries, lower costs |
| Foreign key isolation | Guaranteed data separation at database level |
| Slug + Code system | Human-readable URLs + system-safe identifiers |

### 2. Database Schema

#### Core Entity Relationship

```
Event (1) ─────┬─────> (*) Participant
               ├─────> (*) Stand
               ├─────> (*) CustomField
               ├─────> (*) DocumentConfig
               ├─────> (1) EventConfig
               ├─────> (*) EventAdminAccess
               └─────> (*) AuditLog

EventAdmin (1) ─────> (*) EventAdminAccess
EventAdminAccess (*) ─────> (1) Event
```

#### Event Table Structure

```typescript
Event {
  // Identity
  id: UUID                    // Primary key
  slug: String (unique)       // URL: mega-feira-2025
  name: String                // Display: "Mega Feira 2025"
  code: String (unique)       // System: MEGA-FEIRA-2025

  // Schedule
  startDate: DateTime
  endDate: DateTime
  timezone: String            // Default: America/Sao_Paulo

  // Capacity
  maxCapacity: Int            // Default: 2000
  currentCount: Int           // Auto-updated

  // Status
  status: Enum                // draft, published, active, completed, cancelled
  isActive: Boolean
  isPublic: Boolean           // Public registration vs invitation-only

  // Customization
  theme: JSON                 // Colors, logo, banner
  settings: JSON              // Feature flags, behavior
  features: JSON              // Enabled features per event

  // Relations
  participants[]
  stands[]
  admins[]                    // Via EventAdminAccess
  customFields[]
  documentConfigs[]
}
```

#### Authentication & Authorization

**Three-Tier Permission System:**

1. **SUPER_ADMIN**
   - Full system access
   - Create/manage all events
   - Manage all administrators
   - System configuration

2. **EVENT_ADMIN**
   - Manage assigned events only
   - Approve participants
   - Manage stands
   - Export data
   - Configure event settings

3. **VIEWER**
   - Read-only access
   - View participants
   - View reports
   - No modification rights

**EventAdminAccess Table** (Junction Table):

```typescript
EventAdminAccess {
  adminId: UUID -> EventAdmin
  eventId: UUID -> Event

  // Granular permissions per event
  canView: Boolean
  canEdit: Boolean
  canApprove: Boolean
  canDelete: Boolean
  canExport: Boolean
  canManageStands: Boolean
  canManageAdmins: Boolean

  isActive: Boolean
}
```

**Benefits:**
- One admin can manage multiple events with different permission levels
- Fine-grained access control per event
- Easy permission revocation
- Audit trail of access grants

### 3. Data Isolation Strategy

#### Participant Isolation

**Old Schema:**
```typescript
Participant {
  cpf: String (unique globally)  // ❌ Problem: Same person can't register in 2 events
  eventCode: String               // Weak isolation
}
```

**New Schema:**
```typescript
Participant {
  eventId: UUID -> Event          // ✅ Foreign key enforcement
  cpf: String                     // Not globally unique

  @@unique([eventId, cpf])        // ✅ Unique per event
  @@index([eventId])              // Fast filtering
  @@index([eventId, isActive])
  @@index([eventId, approvalStatus])
}
```

**Isolation Guarantees:**
1. **Database Level**: Foreign key with `onDelete: Cascade` ensures referential integrity
2. **Application Level**: All queries filtered by `eventId`
3. **API Level**: Event context from URL path/authentication
4. **CPF Reuse**: Same person can register in multiple events

#### Stand Isolation

```typescript
Stand {
  eventId: UUID -> Event
  code: String                    // "BASF", "BAYER"

  @@unique([eventId, code])       // ✅ Same stand code in different events
}
```

### 4. URL Routing Strategy

#### Public Registration Pages

```
Pattern: /evento/[slug]

Examples:
  /evento/mega-feira-2025         → Public registration
  /evento/mega-feira-2025/success → Success page
  /evento/mega-feira-2025/consent → Consent page

Implementation:
  app/evento/[slug]/page.tsx      → Dynamic route
  app/evento/[slug]/layout.tsx    → Event-specific layout with theme
```

#### Admin Dashboard

```
Pattern: /admin/evento/[eventId]

Examples:
  /admin                          → Event selector (for multi-event admins)
  /admin/evento/uuid-123          → Dashboard for specific event
  /admin/evento/uuid-123/participants
  /admin/evento/uuid-123/stands
  /admin/evento/uuid-123/settings

Authentication Required:
  - JWT token with adminId
  - EventAdminAccess verification
  - Permission check per action
```

#### API Endpoints

```
Event Management:
  POST   /api/events                → Create event (SUPER_ADMIN)
  GET    /api/events                → List events (filtered by admin access)
  GET    /api/events/[id]           → Get event details
  PATCH  /api/events/[id]           → Update event
  DELETE /api/events/[id]           → Delete event (SUPER_ADMIN)

Participant Management (Event-scoped):
  POST   /api/events/[eventId]/participants     → Register participant
  GET    /api/events/[eventId]/participants     → List participants
  GET    /api/events/[eventId]/participants/[id]
  PATCH  /api/events/[eventId]/participants/[id]
  DELETE /api/events/[eventId]/participants/[id]

Authentication:
  POST   /api/auth/login            → Admin login
  POST   /api/auth/logout           → Logout
  POST   /api/auth/reset-password   → Password reset
  GET    /api/auth/me               → Get current admin + accessible events
```

---

## 🔐 Security & Compliance

### 1. Authentication Flow

```
1. Admin visits /admin/login
2. Submits email + password
3. Server validates credentials (bcrypt)
4. Generates JWT token with adminId + role
5. Client stores token in httpOnly cookie
6. Subsequent requests include token
7. Server validates token + checks EventAdminAccess
```

**JWT Payload:**
```json
{
  "adminId": "uuid-123",
  "email": "admin@example.com",
  "role": "EVENT_ADMIN",
  "iat": 1699999999,
  "exp": 1700086399
}
```

### 2. Authorization Middleware

```typescript
async function requireEventAccess(
  adminId: string,
  eventId: string,
  permission: Permission
): Promise<boolean> {
  // SUPER_ADMIN bypasses event-level permissions
  const admin = await prisma.eventAdmin.findUnique({
    where: { id: adminId }
  })

  if (admin.role === 'SUPER_ADMIN') return true

  // Check EventAdminAccess
  const access = await prisma.eventAdminAccess.findUnique({
    where: {
      adminId_eventId: { adminId, eventId }
    }
  })

  if (!access || !access.isActive) return false

  // Check specific permission
  return access[permission] === true
}
```

### 3. LGPD Compliance

**Per-Event Consent:**
- Each event has custom consent text
- Stored in `EventConfig.consentText`
- Version tracking in `Participant.consentText`
- Consent acceptance recorded per event

**Data Retention:**
- Default: 90 days after event end
- Configurable per event in `Event.settings.retentionDays`
- Automated cleanup via cron job
- Audit log preserved separately

---

## 📊 Data Migration Plan

### Phase 1: Create Default Event

```typescript
// Create "Mega Feira 2025" event from existing data
const defaultEvent = await prisma.event.create({
  data: {
    slug: 'mega-feira-2025',
    name: 'Mega Feira 2025',
    code: 'MEGA-FEIRA-2025',
    startDate: new Date('2025-03-01'),
    endDate: new Date('2025-03-05'),
    maxCapacity: 2000,
    status: 'active',
    isActive: true,
    isPublic: true
  }
})
```

### Phase 2: Migrate Participants

```typescript
// Update all existing participants to belong to default event
await prisma.participant.updateMany({
  where: {
    eventId: null  // Old participants
  },
  data: {
    eventId: defaultEvent.id
  }
})
```

### Phase 3: Migrate Stands

```typescript
// Migrate stands with eventCode to eventId
const stands = await prisma.stand.findMany()

for (const stand of stands) {
  await prisma.stand.update({
    where: { id: stand.id },
    data: { eventId: defaultEvent.id }
  })
}
```

### Phase 4: Create Super Admin

```typescript
import bcrypt from 'bcryptjs'

const superAdmin = await prisma.eventAdmin.create({
  data: {
    name: 'Super Admin',
    email: 'admin@megafeira.com.br',
    password: await bcrypt.hash('initial-password-123', 10),
    role: 'SUPER_ADMIN',
    isActive: true,
    emailVerified: true
  }
})
```

---

## 🎨 UI/UX Changes

### Event Selection Dashboard

**For SUPER_ADMIN:**
```
/admin
┌─────────────────────────────────────┐
│ 📊 Seus Eventos                     │
├─────────────────────────────────────┤
│ [+ Criar Novo Evento]               │
│                                      │
│ 🎪 Mega Feira 2025                  │
│    1,234 participantes · Ativo      │
│    [Acessar Dashboard]              │
│                                      │
│ 🏆 Freio de Ouro 2025               │
│    456 participantes · Publicado    │
│    [Acessar Dashboard]              │
│                                      │
│ 🐄 Expointer 2025                   │
│    0 participantes · Rascunho       │
│    [Acessar Dashboard]              │
└─────────────────────────────────────┘
```

**For EVENT_ADMIN (single event):**
- Auto-redirect to `/admin/evento/[eventId]`
- No event selection shown

**For EVENT_ADMIN (multiple events):**
- Shows only events they have access to
- Permission badges shown per event

### Event-Specific Branding

```typescript
// Load event theme from database
const event = await getEventBySlug('mega-feira-2025')

// Apply custom theme
<div style={{
  '--primary-color': event.theme.primaryColor,
  '--secondary-color': event.theme.secondaryColor
}}>
  <img src={event.theme.logo} alt={event.name} />
  <h1>{event.name}</h1>
</div>
```

---

## 🚀 Implementation Phases

### ✅ Phase 1: Database Schema (COMPLETED)
- [x] Create Event, EventAdmin, EventAdminAccess tables
- [x] Update Participant with eventId foreign key
- [x] Update Stand with eventId foreign key
- [x] Add indexes for performance
- [x] Validate schema with Prisma

### 🔄 Phase 2: Database Migration (NEXT)
- [ ] Create Prisma migration
- [ ] Test migration on development database
- [ ] Create rollback plan
- [ ] Document breaking changes

### Phase 3: Authentication System
- [ ] Create EventAdmin authentication endpoints
- [ ] Implement JWT token generation/validation
- [ ] Create login/logout pages
- [ ] Implement password reset flow
- [ ] Add email verification

### Phase 4: Multi-Event Routing
- [ ] Create dynamic routes `/evento/[slug]`
- [ ] Implement event context provider
- [ ] Update registration flow with event detection
- [ ] Create event selection dashboard

### Phase 5: Admin Interface
- [ ] Event management UI (create/edit/delete)
- [ ] Admin user management
- [ ] Permission assignment interface
- [ ] Event switching for multi-event admins

### Phase 6: Data Migration
- [ ] Create migration scripts
- [ ] Migrate existing participants
- [ ] Create default super admin
- [ ] Test data integrity

### Phase 7: Testing & Deployment
- [ ] End-to-end testing
- [ ] Multi-tenant isolation testing
- [ ] Permission system testing
- [ ] Production deployment

---

## 🔧 Configuration Examples

### Creating a New Event

```typescript
// POST /api/events
{
  "slug": "expointer-2025",
  "name": "Expointer 2025",
  "code": "EXPOINTER-2025",
  "description": "Maior feira agropecuária da América Latina",
  "startDate": "2025-08-24T00:00:00Z",
  "endDate": "2025-09-01T23:59:59Z",
  "maxCapacity": 5000,
  "isPublic": true,
  "theme": {
    "primaryColor": "#1a5f3c",
    "secondaryColor": "#f4a523",
    "logo": "https://storage.example.com/expointer-logo.png"
  },
  "settings": {
    "requireDocuments": true,
    "autoApprove": false,
    "notifyParticipants": true,
    "retentionDays": 120
  },
  "features": {
    "facialRecognition": true,
    "documentUpload": true,
    "hikCentralSync": true
  }
}
```

### Granting Admin Access

```typescript
// POST /api/events/[eventId]/admins
{
  "adminEmail": "joao@example.com",
  "permissions": {
    "canView": true,
    "canEdit": true,
    "canApprove": true,
    "canDelete": false,
    "canExport": true,
    "canManageStands": true,
    "canManageAdmins": false
  }
}
```

---

## 📈 Performance Considerations

### Database Indexes

All critical queries are indexed:
```sql
-- Fast event lookup by slug (public URLs)
CREATE INDEX idx_events_slug ON events(slug);

-- Fast participant filtering by event
CREATE INDEX idx_participants_event_id ON participants(event_id);

-- Fast admin access checks
CREATE INDEX idx_admin_access_admin_event
  ON event_admin_access(admin_id, event_id);

-- Composite indexes for common queries
CREATE INDEX idx_participants_event_status
  ON participants(event_id, approval_status);

CREATE INDEX idx_participants_event_active
  ON participants(event_id, is_active);
```

### Query Optimization

**❌ Bad - Missing event filter:**
```typescript
// Could leak data across events
const participants = await prisma.participant.findMany({
  where: { isActive: true }
})
```

**✅ Good - Always filter by event:**
```typescript
const participants = await prisma.participant.findMany({
  where: {
    eventId: currentEventId,
    isActive: true
  }
})
```

---

## 🎯 Success Metrics

### Before Multi-Event
- ✅ Supports 1 event
- ❌ No access control beyond environment
- ❌ CPF globally unique (prevents multi-event registration)
- ❌ Single admin panel for everyone

### After Multi-Event
- ✅ Supports unlimited events
- ✅ Role-based access control (SUPER_ADMIN, EVENT_ADMIN, VIEWER)
- ✅ Granular permissions per event
- ✅ CPF unique per event (same person can register in multiple events)
- ✅ Event-specific branding and configuration
- ✅ Complete data isolation with database-level enforcement
- ✅ SEO-friendly event URLs
- ✅ Multi-event admin dashboard

---

## 📚 References

- **Prisma Multi-Tenancy Guide**: https://www.prisma.io/docs/guides/database/multi-tenancy
- **Next.js Dynamic Routes**: https://nextjs.org/docs/routing/dynamic-routes
- **JWT Best Practices**: https://tools.ietf.org/html/rfc8725
- **LGPD Compliance**: https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd

---

**Document Status:** ✅ Complete
**Next Action:** Create Prisma migration with `npx prisma migrate dev --name multi_event_architecture`
