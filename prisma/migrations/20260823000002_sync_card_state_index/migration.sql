-- Índice que faltava para a fila do /api/agent/work.
--
-- A consulta filtra `terminalId` + um OR entre faceState, cardState e
-- removalState. Havia índice para dois dos três; sem o de cardState o Postgres
-- não consegue montar o BitmapOr e cai para varrer todo o prefixo do terminal,
-- filtrando linha a linha.
--
-- Medido numa tabela temporária de 32.000 linhas (8.000 participantes × 4
-- terminais, 128 acionáveis — o estado de regime durante a feira):
--
--   sem o índice : 5,655 ms   330 blocos    31.872 linhas descartadas pelo filtro
--   com o índice : 0,362 ms   119 blocos    BitmapOr sobre os 3 índices
--
-- Hoje, com 173 linhas, o plano é Seq Scan e isso é correto — o ganho só
-- aparece na escala do evento, que é exatamente quando não dá para descobrir.
CREATE INDEX "participant_terminal_sync_terminalId_cardState_idx"
    ON "participant_terminal_sync" ("terminalId", "cardState");
