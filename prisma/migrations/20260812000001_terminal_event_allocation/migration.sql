-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "fdid" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "firmwareVersion" TEXT,
ADD COLUMN     "serialNumber" TEXT;

-- CreateTable
CREATE TABLE "terminal_events" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiredAt" TIMESTAMP(3),
    "pendingCleanup" BOOLEAN NOT NULL DEFAULT false,
    "cleanedAt" TIMESTAMP(3),
    "cleanedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminal_events_terminalId_isActive_idx" ON "terminal_events"("terminalId", "isActive");

-- CreateIndex
CREATE INDEX "terminal_events_eventId_idx" ON "terminal_events"("eventId");

-- CreateIndex
CREATE INDEX "terminal_events_pendingCleanup_idx" ON "terminal_events"("pendingCleanup");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_events_terminalId_eventId_startDate_key" ON "terminal_events"("terminalId", "eventId", "startDate");

-- CreateIndex
CREATE INDEX "terminals_ipAddress_idx" ON "terminals"("ipAddress");

-- AddForeignKey
ALTER TABLE "terminal_events" ADD CONSTRAINT "terminal_events_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_events" ADD CONSTRAINT "terminal_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

