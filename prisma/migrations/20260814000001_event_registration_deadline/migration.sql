-- Prazo recomendado de cadastro por evento (orientação no convite ao
-- participante; nunca bloqueia o cadastro). NULL => calculado a partir de
-- startDate menos 4 dias, em código.

-- AlterTable
ALTER TABLE "events" ADD COLUMN "registrationDeadline" TIMESTAMP(3);
