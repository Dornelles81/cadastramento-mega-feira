/**
 * Resposta de CPF já existente no evento — REDAÇÃO ÚNICA.
 *
 * ── Por que a mensagem é a MESMA para ativo e para removido ───────────────
 * O 409 antigo dizia "Este CPF já está cadastrado neste evento". Para quem foi
 * REMOVIDO isso era falso (não está cadastrado) e não dizia o que fazer — a
 * pessoa travava no balcão e só se resolvia mexendo no banco.
 *
 * A tentação era explicar: "removido em 24/08". Mas essa frase acrescenta três
 * informações sobre alguém que NÃO está no evento: que foi removida (juízo, não
 * fato neutro — sugere desligamento), quando, e — cruzada com o stand — onde
 * trabalhava e quando saiu. Qualquer pessoa que digite o CPF de outra receberia
 * isso, e CPF não é segredo no Brasil.
 *
 * Então a resposta é INDISTINGUÍVEL entre os dois estados. O oráculo "este CPF
 * tem cadastro aqui" já existia no 409 antigo e continua existindo; o que NÃO
 * ganha é um segundo nível, que revelaria o estado da pessoa. Quem tem
 * legitimidade para ver os detalhes — o gestor — vê no painel, atrás do token.
 *
 * A parte acionável não depende de dado nenhum: "procure o responsável do seu
 * stand" resolve o balcão sem contar nada sobre ninguém.
 *
 * ⚠️ Use SEMPRE esta função nos dois fluxos de cadastro e nos DOIS 409 de cada
 * um (o da checagem prévia e o da corrida na constraint). Redações diferentes
 * entre caminhos viram o sinal que esta mensagem existe para não dar.
 *
 * Proposta anotada, NÃO implementada: fechar o oráculo de vez exigiria mover a
 * checagem de CPF para depois de alguma prova de posse — muda o cadastro de
 * todo mundo, e foi adiado por estar perto do evento.
 */

export const CPF_DUPLICADO_MENSAGEM =
  'Este CPF já possui cadastro neste evento. Se você não está conseguindo ' +
  'acessar, procure o responsável do seu stand.'

/** Corpo do 409, idêntico para participante ativo e removido. */
export function respostaCpfDuplicado() {
  return {
    error: 'CPF already registered',
    message: CPF_DUPLICADO_MENSAGEM
  }
}
