-- Permissão explícita para operar o BALCÃO de cadastro de um evento.
--
-- ADITIVA e sem backfill: `ADD COLUMN ... NOT NULL DEFAULT false` é
-- metadata-only desde o PostgreSQL 11 (o banco é 17.11), então não há rewrite
-- da tabela nem varredura de linhas. Toda linha existente passa a ler `false`,
-- que é o padrão certo: ninguém ganha acesso ao balcão por esta migration.
--
-- O `lock_timeout` existe porque a coleta está rodando. O ADD COLUMN precisa de
-- um ACCESS EXCLUSIVE de milissegundos no catálogo, mas ele ENFILEIRA atrás de
-- qualquer transação longa que esteja com a tabela — e, enquanto espera, bloqueia
-- todo mundo que chegar depois. Com o timeout, a migration falha rápido e é só
-- rodar de novo, em vez de segurar os cadastros em produção.
SET lock_timeout = '3s';

ALTER TABLE "event_admin_access"
  ADD COLUMN "canRegisterAtDesk" BOOLEAN NOT NULL DEFAULT false;
