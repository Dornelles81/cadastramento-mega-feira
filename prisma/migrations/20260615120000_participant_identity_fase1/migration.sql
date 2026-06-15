-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "employeeNo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "participants_cardNumber_key" ON "participants"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "participants_employeeNo_key" ON "participants"("employeeNo");


-- Sequência dedicada para o employeeNo (id sequencial global no terminal).
-- Não modelada pelo Prisma; consumida via nextval() na atribuição de identidade.
CREATE SEQUENCE IF NOT EXISTS participant_employee_no_seq START 1;
