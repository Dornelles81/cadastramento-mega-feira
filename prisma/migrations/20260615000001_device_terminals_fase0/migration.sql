-- AlterTable
ALTER TABLE "events" ADD COLUMN     "requiresApprovalForAccess" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "cardNumber" TEXT;

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "useHttps" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT 'admin',
    "passwordEncrypted" BYTEA,
    "gate" TEXT,
    "capacityLimit" INTEGER NOT NULL DEFAULT 5000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_terminal_sync" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "faceState" TEXT NOT NULL DEFAULT 'pending',
    "cardState" TEXT NOT NULL DEFAULT 'pending',
    "removalState" TEXT NOT NULL DEFAULT 'none',
    "syncedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_terminal_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tokens" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "agent_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminals_eventId_idx" ON "terminals"("eventId");

-- CreateIndex
CREATE INDEX "terminals_isActive_idx" ON "terminals"("isActive");

-- CreateIndex
CREATE INDEX "participant_terminal_sync_terminalId_removalState_idx" ON "participant_terminal_sync"("terminalId", "removalState");

-- CreateIndex
CREATE INDEX "participant_terminal_sync_terminalId_faceState_idx" ON "participant_terminal_sync"("terminalId", "faceState");

-- CreateIndex
CREATE UNIQUE INDEX "participant_terminal_sync_participantId_terminalId_key" ON "participant_terminal_sync"("participantId", "terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tokens_tokenHash_key" ON "agent_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "agent_tokens_eventId_idx" ON "agent_tokens"("eventId");

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_terminal_sync" ADD CONSTRAINT "participant_terminal_sync_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_terminal_sync" ADD CONSTRAINT "participant_terminal_sync_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

