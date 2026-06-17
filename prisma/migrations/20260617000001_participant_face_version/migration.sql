-- F5: versão (hash) da face no participante e a versão sincronizada por terminal
-- AlterTable
ALTER TABLE "participant_terminal_sync" ADD COLUMN     "faceVersion" TEXT;
-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "faceVersion" TEXT;
