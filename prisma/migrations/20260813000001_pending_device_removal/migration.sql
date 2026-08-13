-- Tombstone de remoção no device, IMUNE ao cascade do hard delete.
--
-- ParticipantTerminalSync tem onDelete: Cascade para Participant, então o hard
-- delete apagava a linha que serviria para enfileirar a remoção — e a biometria
-- ficava no terminal depois que o painel confirmava a exclusão (buraco LGPD).
-- Esta tabela NÃO referencia Participant de propósito: é gravada ANTES do
-- delete e sobrevive a ele.
--
-- Guarda só o identificador TÉCNICO (employeeNo). Nenhum dado pessoal.

CREATE TABLE "pending_device_removals" (
    "id"          TEXT NOT NULL,
    "employeeNo"  TEXT NOT NULL,
    "terminalId"  TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt"   TIMESTAMP(3),
    "attempts"    INTEGER NOT NULL DEFAULT 0,
    "lastError"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_device_removals_pkey" PRIMARY KEY ("id")
);

-- employeeNo é sequencial global e nunca reutilizado: um pedido por pessoa por device.
CREATE UNIQUE INDEX "pending_device_removals_employeeNo_terminalId_key"
    ON "pending_device_removals"("employeeNo", "terminalId");

-- Fila do /work: pendências ainda em aberto por terminal.
CREATE INDEX "pending_device_removals_terminalId_removedAt_idx"
    ON "pending_device_removals"("terminalId", "removedAt");

-- FK para Terminal é desejada: sem terminal cadastrado não há device a limpar.
ALTER TABLE "pending_device_removals"
    ADD CONSTRAINT "pending_device_removals_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "terminals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
