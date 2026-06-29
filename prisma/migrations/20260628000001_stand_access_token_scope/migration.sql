-- AlterTable
ALTER TABLE "stand_access_tokens" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'manage';

-- DropIndex
DROP INDEX "stand_access_tokens_standId_idx";

-- CreateIndex
CREATE INDEX "stand_access_tokens_standId_scope_idx" ON "stand_access_tokens"("standId", "scope");
