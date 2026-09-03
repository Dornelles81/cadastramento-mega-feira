-- Backoff progressivo por linha de sync.
--
-- Até aqui o /work filtrava com uma espera FIXA de 60s (`lastAttemptAt <
-- agora - 60s`). Com teto de 8, as tentativas de uma linha se esgotavam em
-- oito minutos — uma amostra só do estado do device.
--
-- Em 2026-09-02 isso abandonou dois cadastros reais: duas fotos falharam com
-- `SubpicAnalysisModelingError` nos quatro terminais, foram devolvidas à fila
-- SEM alteração nenhuma na imagem, e carregaram. O erro é intermitente; o que
-- as condenava era a janela, não o número de tentativas.
--
-- `nextAttemptAt` guarda por linha quando ela volta a ser elegível, calculado
-- em `lib/agent/retry-policy` (1, 2, 4, ... 128 min). Nullable: linha nunca
-- tentada não tem próxima tentativa agendada, e é elegível de imediato.
--
-- O índice acompanha o filtro do /work, que passa a ser
-- "estado pendente/failed E (nextAttemptAt IS NULL OR nextAttemptAt <= now)".
ALTER TABLE "participant_terminal_sync" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "participant_terminal_sync_terminalId_nextAttemptAt_idx"
  ON "participant_terminal_sync" ("terminalId", "nextAttemptAt");
