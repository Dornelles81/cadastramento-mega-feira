-- CreateTable
CREATE TABLE "participant_edit_tokens" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "participant_edit_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_edit_tokens_tokenHash_key" ON "participant_edit_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "participant_edit_tokens_participantId_idx" ON "participant_edit_tokens"("participantId");

-- AddForeignKey
ALTER TABLE "participant_edit_tokens" ADD CONSTRAINT "participant_edit_tokens_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

