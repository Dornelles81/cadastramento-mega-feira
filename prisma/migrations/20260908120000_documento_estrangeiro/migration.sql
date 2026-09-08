-- Documento estrangeiro: cadastro sem CPF, mantendo o CPF obrigatorio para
-- brasileiros. Ver lib/participants/documento.ts para o formato do valor.
--
-- TRES colunas, todas ADITIVAS:
--
--   event_configs.allowForeignDocument  -- interruptor POR EVENTO, default false.
--     Nenhum evento muda de comportamento com esta migration; a Expofest liga
--     quando quiser e o rollback e um UPDATE.
--
--   participants.documentType     -- 'PP' | 'DNI' | 'CI' | 'OUTRO'; NULL = CPF
--   participants.documentCountry  -- ISO-3166 alpha-2; NULL = CPF (Brasil)
--
-- NAO toca o indice UNIQUE (eventId, cpf) nem o participants_cpf_idx: o
-- documento estrangeiro entra na MESMA coluna `cpf`, com tipo e pais embutidos
-- no valor, entao a unicidade que ja existe passa a valer para ele de graca.
-- As 1131 linhas existentes ficam byte a byte iguais — zero backfill.
--
-- ADD COLUMN nullable e ADD COLUMN NOT NULL DEFAULT sao metadata-only no
-- PostgreSQL 17: sem rewrite de tabela, sem varredura de linhas.
--
-- `lock_timeout` porque a captacao da Expofest esta rodando e `participants` e
-- a tabela mais quente do sistema: o ACCESS EXCLUSIVE de milissegundos que o
-- ADD COLUMN precisa ENFILEIRA atras de qualquer transacao longa e, enquanto
-- espera, bloqueia quem chegar depois. Falhar rapido e repetir e melhor que
-- segurar cadastros.
SET lock_timeout = '3s';

ALTER TABLE "event_configs"
  ADD COLUMN "allowForeignDocument" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "participants"
  ADD COLUMN "documentType" TEXT,
  ADD COLUMN "documentCountry" TEXT;
