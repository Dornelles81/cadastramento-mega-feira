-- CreateTable
CREATE TABLE "balcao_access_tokens" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "balcao_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "balcao_access_tokens_tokenHash_key" ON "balcao_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "balcao_access_tokens_eventId_idx" ON "balcao_access_tokens"("eventId");

-- AddForeignKey
ALTER TABLE "balcao_access_tokens" ADD CONSTRAINT "balcao_access_tokens_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

