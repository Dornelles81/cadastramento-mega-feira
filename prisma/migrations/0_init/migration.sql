-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gate" TEXT,
    "location" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "operatorEmail" TEXT,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "deviceIp" TEXT,
    "verificationMethod" TEXT NOT NULL DEFAULT 'QR_CODE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_stats" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "currentInsideCount" INTEGER NOT NULL DEFAULT 0,
    "totalEntries" INTEGER NOT NULL DEFAULT 0,
    "totalExits" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "peakCount" INTEGER NOT NULL DEFAULT 0,
    "peakTime" TIMESTAMP(3),
    "lastEntryAt" TIMESTAMP(3),
    "lastExitAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_logs" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "adminUser" TEXT,
    "adminIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminEmail" TEXT,
    "adminId" TEXT,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "adminUser" TEXT,
    "adminIp" TEXT,
    "previousData" JSONB,
    "newData" JSONB,
    "changes" JSONB,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminEmail" TEXT,
    "adminId" TEXT,
    "eventId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "userAgent" TEXT,
    "actorType" TEXT,
    "standId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "options" JSONB,
    "validation" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,
    "group" TEXT,
    "helpText" TEXT,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_configs" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "enableOCR" BOOLEAN NOT NULL DEFAULT false,
    "acceptedFormats" JSONB,
    "maxSizeMB" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT,
    "helpText" TEXT,
    "icon" TEXT,

    CONSTRAINT "document_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_admin_access" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "canManageStands" BOOLEAN NOT NULL DEFAULT false,
    "canManageAdmins" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_admin_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EVENT_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "verifyToken" TEXT,
    "verifyTokenExp" TIMESTAMP(3),
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_configs" (
    "id" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "requireConsent" BOOLEAN NOT NULL DEFAULT true,
    "requireFace" BOOLEAN NOT NULL DEFAULT true,
    "defaultFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accentColor" TEXT,
    "adminEmail" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "bannerUrl" TEXT,
    "consentText" TEXT,
    "customCSS" TEXT,
    "enableCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "enableExport" BOOLEAN NOT NULL DEFAULT true,
    "enableQRCode" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT NOT NULL,
    "faviconUrl" TEXT,
    "notifyOnApprove" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnRegister" BOOLEAN NOT NULL DEFAULT false,
    "requireDocuments" BOOLEAN NOT NULL DEFAULT false,
    "successMessage" TEXT,
    "welcomeMessage" TEXT,

    CONSTRAINT "event_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "maxCapacity" INTEGER NOT NULL DEFAULT 2000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "organizerEmail" TEXT,
    "organizerName" TEXT,
    "organizerPhone" TEXT,
    "publishedAt" TIMESTAMP(3),
    "registrationUrl" TEXT,
    "settings" JSONB,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "tags" TEXT[],
    "theme" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueAddress" TEXT,
    "venueCity" TEXT,
    "venueName" TEXT,
    "venueState" TEXT,
    "vehicleOrientations" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hikcental_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL DEFAULT '/api/acs/v1',
    "authType" TEXT NOT NULL DEFAULT 'apikey',
    "username" TEXT,
    "password" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "libraryId" TEXT NOT NULL DEFAULT '1',
    "libraryType" TEXT NOT NULL DEFAULT 'blackFD',
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelay" INTEGER NOT NULL DEFAULT 5000,
    "requestTimeout" INTEGER NOT NULL DEFAULT 30000,
    "rateLimit" INTEGER NOT NULL DEFAULT 10,
    "defaultAccessLevel" TEXT NOT NULL DEFAULT '1',
    "validityDays" INTEGER NOT NULL DEFAULT 90,
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "syncInterval" INTEGER NOT NULL DEFAULT 300,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hikcental_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hikcental_sync_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "totalParticipants" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "configUsed" JSONB,
    "filterCriteria" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "triggeredBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hikcental_sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hikcental_sync_logs" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "syncDirection" TEXT NOT NULL DEFAULT 'upload',
    "requestData" JSONB,
    "responseData" JSONB,
    "httpStatus" INTEGER,
    "hikCentralPersonId" TEXT,
    "hikCentralCardNo" TEXT,
    "accessLevelIds" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "batchId" TEXT,
    "batchPosition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hikcental_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hikcental_webhook_logs" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "processStatus" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "participantId" TEXT,
    "hikCentralPersonId" TEXT,
    "sourceIp" TEXT,
    "headers" JSONB,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hikcental_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "eventCode" TEXT,
    "faceImageUrl" TEXT,
    "faceData" BYTEA,
    "captureQuality" DOUBLE PRECISION,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "consentIp" TEXT,
    "consentDate" TIMESTAMP(3),
    "deviceInfo" TEXT,
    "captureLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customData" JSONB,
    "documents" JSONB,
    "hikCentralErrorMsg" TEXT,
    "hikCentralPersonId" TEXT,
    "hikCentralSyncStatus" TEXT DEFAULT 'pending',
    "hikCentralSyncedAt" TIMESTAMP(3),
    "approvalStatus" TEXT DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "standId" TEXT,
    "browserInfo" TEXT,
    "checkInLocation" TEXT,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "consentText" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "eventId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "retentionDate" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "credentialPrinted" BOOLEAN NOT NULL DEFAULT false,
    "credentialPrintedAt" TIMESTAMP(3),
    "credentialPrintedBy" TEXT,
    "credentialNumber" TEXT,
    "ivimsSync" BOOLEAN NOT NULL DEFAULT false,
    "ivimsSyncedAt" TIMESTAMP(6),
    "ivmsRemovalPending" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stand_access_tokens" (
    "id" TEXT NOT NULL,
    "standId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "stand_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "maxRegistrations" INTEGER NOT NULL DEFAULT 3,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "eventCode" TEXT,
    "responsibleName" TEXT,
    "responsibleEmail" TEXT,
    "responsiblePhone" TEXT,
    "location" TEXT,
    "notes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "area" TEXT,
    "category" TEXT,
    "eventId" TEXT,
    "hall" TEXT,
    "metadata" JSONB,
    "position" TEXT,

    CONSTRAINT "stands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_access_logs" (
    "id" TEXT NOT NULL,
    "vehicleCredentialId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gate" TEXT,
    "operatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_credentials" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VEÍCULO',
    "plate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "credentialPrinted" BOOLEAN NOT NULL DEFAULT false,
    "credentialPrintedAt" TIMESTAMP(3),
    "credentialPrintedBy" TEXT,

    CONSTRAINT "vehicle_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_createdAt_idx" ON "access_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "access_logs_eventId_createdAt_idx" ON "access_logs"("eventId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "access_logs_eventId_idx" ON "access_logs"("eventId" ASC);

-- CreateIndex
CREATE INDEX "access_logs_eventId_type_idx" ON "access_logs"("eventId" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "access_logs_participantId_createdAt_idx" ON "access_logs"("participantId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "access_logs_participantId_idx" ON "access_logs"("participantId" ASC);

-- CreateIndex
CREATE INDEX "access_logs_type_idx" ON "access_logs"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "access_stats_eventId_key" ON "access_stats"("eventId" ASC);

-- CreateIndex
CREATE INDEX "approval_logs_action_idx" ON "approval_logs"("action" ASC);

-- CreateIndex
CREATE INDEX "approval_logs_adminId_idx" ON "approval_logs"("adminId" ASC);

-- CreateIndex
CREATE INDEX "approval_logs_createdAt_idx" ON "approval_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "approval_logs_participantId_idx" ON "approval_logs"("participantId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_adminId_idx" ON "audit_logs"("adminId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_eventId_action_idx" ON "audit_logs"("eventId" ASC, "action" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_eventId_idx" ON "audit_logs"("eventId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_standId_createdAt_idx" ON "audit_logs"("standId" ASC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "custom_fields_active_idx" ON "custom_fields"("active" ASC);

-- CreateIndex
CREATE INDEX "custom_fields_eventId_active_order_idx" ON "custom_fields"("eventId" ASC, "active" ASC, "order" ASC);

-- CreateIndex
CREATE INDEX "custom_fields_eventId_idx" ON "custom_fields"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_fieldName_eventId_key" ON "custom_fields"("fieldName" ASC, "eventId" ASC);

-- CreateIndex
CREATE INDEX "custom_fields_order_idx" ON "custom_fields"("order" ASC);

-- CreateIndex
CREATE INDEX "document_configs_active_idx" ON "document_configs"("active" ASC);

-- CreateIndex
CREATE INDEX "document_configs_eventId_idx" ON "document_configs"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "event_admin_access_adminId_eventId_key" ON "event_admin_access"("adminId" ASC, "eventId" ASC);

-- CreateIndex
CREATE INDEX "event_admin_access_adminId_idx" ON "event_admin_access"("adminId" ASC);

-- CreateIndex
CREATE INDEX "event_admin_access_eventId_idx" ON "event_admin_access"("eventId" ASC);

-- CreateIndex
CREATE INDEX "event_admin_access_isActive_idx" ON "event_admin_access"("isActive" ASC);

-- CreateIndex
CREATE INDEX "event_admins_email_idx" ON "event_admins"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "event_admins_email_key" ON "event_admins"("email" ASC);

-- CreateIndex
CREATE INDEX "event_admins_isActive_idx" ON "event_admins"("isActive" ASC);

-- CreateIndex
CREATE INDEX "event_admins_lastLoginAt_idx" ON "event_admins"("lastLoginAt" ASC);

-- CreateIndex
CREATE INDEX "event_admins_role_idx" ON "event_admins"("role" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "event_configs_eventId_key" ON "event_configs"("eventId" ASC);

-- CreateIndex
CREATE INDEX "events_code_idx" ON "events"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "events_code_key" ON "events"("code" ASC);

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "events_endDate_idx" ON "events"("endDate" ASC);

-- CreateIndex
CREATE INDEX "events_isActive_idx" ON "events"("isActive" ASC);

-- CreateIndex
CREATE INDEX "events_slug_idx" ON "events"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug" ASC);

-- CreateIndex
CREATE INDEX "events_startDate_idx" ON "events"("startDate" ASC);

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status" ASC);

-- CreateIndex
CREATE INDEX "events_status_isActive_idx" ON "events"("status" ASC, "isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "hikcental_sync_batches_batchNumber_key" ON "hikcental_sync_batches"("batchNumber" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_batches_createdAt_idx" ON "hikcental_sync_batches"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_batches_syncStatus_idx" ON "hikcental_sync_batches"("syncStatus" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_logs_batchId_idx" ON "hikcental_sync_logs"("batchId" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_logs_createdAt_idx" ON "hikcental_sync_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_logs_participantId_idx" ON "hikcental_sync_logs"("participantId" ASC);

-- CreateIndex
CREATE INDEX "hikcental_sync_logs_syncStatus_idx" ON "hikcental_sync_logs"("syncStatus" ASC);

-- CreateIndex
CREATE INDEX "hikcental_webhook_logs_createdAt_idx" ON "hikcental_webhook_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "hikcental_webhook_logs_eventType_idx" ON "hikcental_webhook_logs"("eventType" ASC);

-- CreateIndex
CREATE INDEX "hikcental_webhook_logs_participantId_idx" ON "hikcental_webhook_logs"("participantId" ASC);

-- CreateIndex
CREATE INDEX "hikcental_webhook_logs_processStatus_idx" ON "hikcental_webhook_logs"("processStatus" ASC);

-- CreateIndex
CREATE INDEX "participants_approvalStatus_idx" ON "participants"("approvalStatus" ASC);

-- CreateIndex
CREATE INDEX "participants_checkedIn_idx" ON "participants"("checkedIn" ASC);

-- CreateIndex
CREATE INDEX "participants_cpf_idx" ON "participants"("cpf" ASC);

-- CreateIndex
CREATE INDEX "participants_createdAt_idx" ON "participants"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "participants_eventCode_idx" ON "participants"("eventCode" ASC);

-- CreateIndex
CREATE INDEX "participants_eventId_approvalStatus_idx" ON "participants"("eventId" ASC, "approvalStatus" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "participants_eventId_cpf_key" ON "participants"("eventId" ASC, "cpf" ASC);

-- CreateIndex
CREATE INDEX "participants_eventId_idx" ON "participants"("eventId" ASC);

-- CreateIndex
CREATE INDEX "participants_eventId_isActive_idx" ON "participants"("eventId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "participants_hikCentralSyncStatus_idx" ON "participants"("hikCentralSyncStatus" ASC);

-- CreateIndex
CREATE INDEX "participants_isActive_idx" ON "participants"("isActive" ASC);

-- CreateIndex
CREATE INDEX "participants_isDeleted_idx" ON "participants"("isDeleted" ASC);

-- CreateIndex
CREATE INDEX "participants_standId_idx" ON "participants"("standId" ASC);

-- CreateIndex
CREATE INDEX "stand_access_tokens_standId_idx" ON "stand_access_tokens"("standId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "stand_access_tokens_tokenHash_key" ON "stand_access_tokens"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "stands_code_idx" ON "stands"("code" ASC);

-- CreateIndex
CREATE INDEX "stands_eventId_idx" ON "stands"("eventId" ASC);

-- CreateIndex
CREATE INDEX "stands_eventId_isActive_idx" ON "stands"("eventId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "stands_isActive_idx" ON "stands"("isActive" ASC);

-- CreateIndex
CREATE INDEX "vehicle_access_logs_eventId_idx" ON "vehicle_access_logs"("eventId" ASC);

-- CreateIndex
CREATE INDEX "vehicle_access_logs_vehicleCredentialId_createdAt_idx" ON "vehicle_access_logs"("vehicleCredentialId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "vehicle_access_logs_vehicleCredentialId_idx" ON "vehicle_access_logs"("vehicleCredentialId" ASC);

-- CreateIndex
CREATE INDEX "vehicle_credentials_credentialPrinted_idx" ON "vehicle_credentials"("credentialPrinted" ASC);

-- CreateIndex
CREATE INDEX "vehicle_credentials_eventId_idx" ON "vehicle_credentials"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_credentials_eventId_number_key" ON "vehicle_credentials"("eventId" ASC, "number" ASC);

-- CreateIndex
CREATE INDEX "vehicle_credentials_isActive_idx" ON "vehicle_credentials"("isActive" ASC);

-- CreateIndex
CREATE INDEX "vehicle_credentials_plate_idx" ON "vehicle_credentials"("plate" ASC);

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_stats" ADD CONSTRAINT "access_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "event_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "event_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_configs" ADD CONSTRAINT "document_configs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_admin_access" ADD CONSTRAINT "event_admin_access_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "event_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_admin_access" ADD CONSTRAINT "event_admin_access_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_configs" ADD CONSTRAINT "event_configs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hikcental_sync_logs" ADD CONSTRAINT "hikcental_sync_logs_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stand_access_tokens" ADD CONSTRAINT "stand_access_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "event_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stand_access_tokens" ADD CONSTRAINT "stand_access_tokens_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stands" ADD CONSTRAINT "stands_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_access_logs" ADD CONSTRAINT "vehicle_access_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_access_logs" ADD CONSTRAINT "vehicle_access_logs_vehicleCredentialId_fkey" FOREIGN KEY ("vehicleCredentialId") REFERENCES "vehicle_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_credentials" ADD CONSTRAINT "vehicle_credentials_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

