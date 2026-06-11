-- DropForeignKey
ALTER TABLE "stand_access_tokens" DROP CONSTRAINT "stand_access_tokens_createdById_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actorIdentifier" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "targetParticipantId" TEXT,
ADD COLUMN     "targetSnapshot" JSONB;

-- AlterTable
ALTER TABLE "participants" DROP COLUMN "ivmsRemovalPending",
ADD COLUMN     "pendingDeviceRemoval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "stand_access_tokens" DROP COLUMN "createdById",
ADD COLUMN     "createdBy" TEXT;

