-- Termo de consentimento versionado (LGPD biométrico).
-- Aditivo e nullable: não toca os participantes/eventos existentes (legado = NULL).
-- Participant.consentTermVersion: versão do termo que o titular aceitou.
-- EventConfig.consentTermVersion: versão que o evento usa (NULL = fluxo antigo).
ALTER TABLE "participants" ADD COLUMN "consentTermVersion" TEXT;
ALTER TABLE "event_configs" ADD COLUMN "consentTermVersion" TEXT;
