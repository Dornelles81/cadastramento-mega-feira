-- ============================================================================
-- FASE 1 — Acesso Delegado por Stand (SPEC-acesso-por-stand.md)
-- SQL gerado via `prisma migrate diff` e aplicado com `prisma db push`.
-- Mudanças 100% aditivas — nenhum dado existente é alterado.
--
-- Mapeamento SPEC → schema real:
--   stands.responsavel_nome/email  → já existiam (responsibleName/responsibleEmail)
--   stands.limite_vagas            → já existia (maxRegistrations)
--   credenciados                   → tabela "participants"
--   credenciados.status/removido_* → já existiam (isDeleted/deletedAt/deletedBy)
--   audit_logs                     → tabela já existia; estendida com standId/actorType
-- ============================================================================

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actorType" TEXT,
ADD COLUMN     "standId" TEXT;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "ivmsRemovalPending" BOOLEAN NOT NULL DEFAULT false;

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

-- CreateIndex
CREATE UNIQUE INDEX "stand_access_tokens_tokenHash_key" ON "stand_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "stand_access_tokens_standId_idx" ON "stand_access_tokens"("standId");

-- CreateIndex
CREATE INDEX "audit_logs_standId_createdAt_idx" ON "audit_logs"("standId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "stand_access_tokens" ADD CONSTRAINT "stand_access_tokens_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stand_access_tokens" ADD CONSTRAINT "stand_access_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "event_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_standId_fkey" FOREIGN KEY ("standId") REFERENCES "stands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
