-- Texto de conclusão do fluxo de cadastro por LINK DE STAND, por evento.
--
-- Campo PRÓPRIO, e não reúso de `successMessage`: aquele já está preenchido em
-- todos os eventos (a Expofest inclusive, com "Retire sua credencial física na
-- secretaria do parque") e hoje NÃO é lido pelo fluxo de stand. Passar a lê-lo
-- mudaria a tela final da Expofest, que está em captação ativa. Com uma coluna
-- nova, todo evento existente nasce em NULL e continua exibindo exatamente o que
-- exibe hoje.
--
-- ADITIVA e sem backfill: `ADD COLUMN` nullable é metadata-only (PostgreSQL
-- 17.11) — sem rewrite da tabela, sem varredura de linhas, sem DEFAULT.
--
-- `lock_timeout` porque a coleta da Expofest está rodando: o ADD COLUMN precisa
-- de um ACCESS EXCLUSIVE de milissegundos no catálogo, mas ENFILEIRA atrás de
-- qualquer transação longa que esteja com a tabela e, enquanto espera, bloqueia
-- quem chegar depois. Falhar rápido e repetir é melhor que segurar cadastros.
SET lock_timeout = '3s';

ALTER TABLE "event_configs"
  ADD COLUMN "standSuccessMessage" TEXT;
