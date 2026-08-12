# SPEC Fase 7 — Política de Substituição de Participantes (anti-rotatividade de credenciais)

## Contexto e problema

Com a exclusão self-service da Fase 5, o responsável pelo stand pode reciclar vagas: o participante A entra no evento de manhã, é excluído, B é cadastrado na vaga e entra à tarde — uma vaga de expositor vira múltiplas entradas gratuitas no mesmo dia, gerando fuga de receita da bilheteria (Mega Entrada).

## A regra de ouro (núcleo obrigatório)

> **Uma vaga utilizada no dia não pode ser reutilizada no mesmo dia.**

Operacionalização no momento da exclusão:

- Se o participante excluído **NÃO tem check-in no dia operacional corrente** → a vaga é liberada imediatamente (correção legítima: cadastro errado, desistência, troca antes do evento).
- Se o participante excluído **TEM check-in no dia operacional corrente** → a exclusão acontece normalmente (status, biometria, dispositivo, auditoria — tudo igual à Fase 5), mas **a vaga permanece ocupada até a próxima virada do dia operacional**.

"Dia operacional" = período entre duas viradas. A virada ocorre no horário `dayResetHour` (default **4h da manhã**, timezone `America/Sao_Paulo`), seguindo o padrão já usado no controle de veículos. Check-in "no dia corrente" = existe registro de entrada em `access_logs` com timestamp posterior à última virada.

Importante: o bloqueio é **da vaga, não da pessoa**. O excluído perde o acesso físico imediatamente (deleteUser no dispositivo, como hoje). O que fica travado é apenas o slot para novo cadastro.

## Implementação

### 1. Schema (Prisma)

```prisma
// Participant — novo campo
slotLockedUntil DateTime?   // preenchido na exclusão quando há check-in no dia; null caso contrário

// Event — novo campo de configuração
dayResetHour Int @default(4)   // hora da virada do dia operacional (0-23)
```

### 2. Definição canônica de "vaga ocupada" (atualiza a regra das Fases 3/4)

```
ocupada = (status = 'active' AND isDeleted = false)
          OR (status = 'removed' AND slotLockedUntil > now())
```

- **Todos** os pontos que contam ocupação passam a usar esta definição: transação de cadastro (Fase 4), painel do responsável (Fase 3), recálculo de `currentCount`.
- Atenção ao cache: `currentCount` continua atualizado em transação, mas agora um slot pode "liberar sozinho" quando `slotLockedUntil` expira, sem evento de escrita. Solução: `currentCount` armazena a contagem *incluindo* locks no momento da escrita, e os pontos de leitura críticos (validação de vaga no cadastro) **sempre recontam dentro da transação** — o cache fica apenas para exibição, com tolerância a pequena defasagem. Documentar isso no código.

### 3. Fluxo de exclusão (estende a Fase 5)

Na transação de exclusão, após o lock da linha do stand:

1. Consultar `access_logs` do participante: existe entrada com `timestamp >= ultimaVirada(dayResetHour, America/Sao_Paulo)`?
2. **Sim** → `slotLockedUntil = proximaVirada()`. **Não** → `slotLockedUntil = null`.
3. Restante do fluxo idêntico à Fase 5 (limpeza sensível, deleteUser/pendingDeviceRemoval, currentCount, audit log).
4. O audit log `PARTICIPANT_REMOVED` ganha no `targetSnapshot`: `hadCheckinToday: boolean` e `slotLockedUntil` (quando aplicável).

### 4. UI do painel do responsável

- **Antes de confirmar** a exclusão, o modal informa a consequência real:
  - Sem check-in hoje: "A vaga ficará disponível imediatamente para novo cadastro."
  - Com check-in hoje: "Este participante já acessou o evento hoje. A exclusão será efetivada agora, mas a vaga só estará disponível para novo cadastro a partir das {hora} de {data}."
- Na visão de ocupação, slot travado aparece distinto de slot livre e de slot ativo (ex.: "2 ativos · 1 vaga liberando às 4h de 13/06 · 0 disponíveis").
- Tentativa de cadastro com todas as vagas entre ativas e travadas → mensagem clara: "Stand sem vagas disponíveis no momento. Próxima liberação: {data/hora}." (não usar o erro genérico de "stand lotado" — o responsável precisa entender a diferença).

### 5. Cálculo da virada — cuidados

- Timezone fixa `America/Sao_Paulo` (o evento é físico no Brasil; não usar timezone do navegador nem UTC puro).
- `ultimaVirada()`: hoje às `dayResetHour` se agora >= isso; senão, ontem às `dayResetHour`.
- Testes devem cobrir os limites: exclusão às 3h59 vs 4h01, check-in às 3h58 seguido de exclusão às 4h05 (check-in pertence ao dia anterior → libera na hora).

## Módulo opcional — cota de substituições (desligado por padrão)

Para promotores que quiserem régua adicional. Só implementar a estrutura; ativação é por evento.

```prisma
// Event
substitutionQuotaEnabled Boolean @default(false)
substitutionsPerSlot     Int     @default(1)   // trocas incluídas por vaga durante o evento

// Stand
substitutionsUsed Int @default(0)
```

Regras quando ativado:
- Exclusões **antes do startDate do evento** não consomem cota (montagem de equipe é livre).
- Exclusão durante o evento consome 1 de `substitutionsUsed` (limite = maxRegistrations × substitutionsPerSlot).
- Cota esgotada → o botão "Excluir" do painel informa que novas trocas devem ser solicitadas à organização; a exclusão via admin continua sempre possível (e o admin vê o contador, podendo cobrar a troca extra conforme contrato).
- Auditoria: `SUBSTITUTION_QUOTA_CONSUMED` no log, e contador visível no painel do responsável ("Substituições: 1 de 3").

## Relatório (acrescentar à página de auditoria da Fase 6)

- Visão "Trocas por stand": total de exclusões durante o evento, quantas com `hadCheckinToday = true`, cota consumida (se ativa). Ordenável por volume — stands no topo são os candidatos a conversa com o promotor.

## Critérios de aceite

- [ ] Excluir participante com check-in hoje NÃO permite novo cadastro na vaga até a virada (testar tentativa imediata → bloqueada; após a virada → permitida).
- [ ] Excluir participante sem check-in hoje libera a vaga imediatamente.
- [ ] Check-in de ontem (antes da virada) não trava a vaga.
- [ ] Excluído com vaga travada perde acesso físico imediatamente (deleteUser/fila), independente do lock.
- [ ] Corrida: exclusão com lock + tentativa de cadastro simultânea → cadastro falha enquanto o lock vale.
- [ ] currentCount e contagem real permanecem coerentes com slots travados, inclusive após expiração do lock.
- [ ] Modal de exclusão exibe a consequência correta nos dois cenários antes da confirmação.
- [ ] Com cota ativada: exclusões pré-evento não consomem; durante o evento consomem; esgotada bloqueia no painel mas não no admin.
- [ ] Auditoria registra hadCheckinToday, slotLockedUntil e consumo de cota.

## Ordem sugerida

1. Schema + definição canônica de ocupação (com os testes de contagem).
2. Fluxo de exclusão com lock + cálculo de virada (com os testes de limite de horário).
3. UI do painel (modal, ocupação com três estados, mensagens).
4. Módulo de cota (estrutura + flag por evento).
5. Relatório de trocas na página de auditoria.

---

# ANEXO — Minuta de cláusula contratual (credenciamento de expositores)

Para anexar aos contratos com promotores/expositores. Revisar com advogado antes do uso.

> **Cláusula — Credenciais de Expositor**
>
> 1. As credenciais de acesso vinculadas ao stand são pessoais e intransferíveis, emitidas mediante cadastro individual com captura biométrica facial, na quantidade de vagas contratada.
>
> 2. O EXPOSITOR, por meio do responsável indicado, poderá substituir os titulares das credenciais através do painel de gestão do seu stand. A substituição de credencial cuja utilização já tenha ocorrido no dia somente disponibilizará a vaga para novo cadastro a partir do início do dia operacional seguinte, definido às 04h00.
>
> 3. As credenciais de expositor destinam-se exclusivamente ao acesso de pessoal envolvido na operação do stand, sendo vedada sua utilização, direta ou indireta, como meio de acesso de visitantes em substituição à bilheteria oficial do evento. A constatação de uso irregular, apurada pelos registros de acesso e auditoria do sistema, sujeitará o EXPOSITOR às penalidades previstas neste contrato, incluindo a suspensão das credenciais do stand.
>
> 4. [Opcional, se cota ativada] Estão incluídas no contrato até {N} substituições de credencial por vaga durante o período do evento. Substituições excedentes deverão ser solicitadas à ORGANIZAÇÃO e estarão sujeitas à taxa de R$ {valor} por substituição.
>
> 5. Todos os cadastros, acessos, substituições e exclusões são registrados em trilha de auditoria com data, hora e autoria, disponível à ORGANIZAÇÃO para fins de fiscalização.
