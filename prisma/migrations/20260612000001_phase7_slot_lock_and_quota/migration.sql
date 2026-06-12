-- AlterTable
ALTER TABLE "events" ADD COLUMN     "dayResetHour" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "substitutionQuotaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "substitutionsPerSlot" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "slotLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stands" ADD COLUMN     "substitutionsUsed" INTEGER NOT NULL DEFAULT 0;

