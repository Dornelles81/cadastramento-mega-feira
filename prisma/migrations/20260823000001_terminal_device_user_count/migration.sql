-- Contagem de usuários REAL do device, lida do ISAPI no mesmo probe do heartbeat.
--
-- Antes, `getUserCount()` era chamado e o resultado descartado: servia só como
-- prova de vida. A nuvem não sabia quantas faces existem em cada terminal, e o
-- `capacityLimit` (default 5000) era um número que ninguém comparava com a
-- realidade. Num evento de 8.000 pessoas, o terminal encheria e a primeira
-- notícia seria um push falhando no meio da feira.
--
-- Ambas nullable: device offline não tem contagem, e firmware cuja resposta o
-- agente não reconhece reporta ausência em vez de chutar um número.
-- `deviceUserCountAt` diz de quando é a medição, para uma contagem velha não
-- passar por atual.
ALTER TABLE "terminals" ADD COLUMN "deviceUserCount" INTEGER;
ALTER TABLE "terminals" ADD COLUMN "deviceUserCountAt" TIMESTAMP(3);
