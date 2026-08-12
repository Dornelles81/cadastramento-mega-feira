# ADENDO à SPEC-acesso-por-stand.md — Ajustes pós-análise do schema

Este adendo sobrepõe a SPEC original nos pontos abaixo. Onde houver conflito, vale o adendo. O projeto usa Prisma: **todas as alterações de banco devem ser feitas via `schema.prisma` + `prisma migrate dev`**, não SQL manual. Manter a nomenclatura em inglês do schema existente.

## 1. Nomenclatura e modelos

- "Credenciados" = model `Participant` (tabela `participants`, FK `standId`). Usar esse nome em todo o código novo.
- `Stand` já possui: `maxRegistrations` (default 3), `currentCount` (cache de ocupação), `responsibleName`, `responsibleEmail`, `responsiblePhone`. **Não criar campos duplicados.** A seção 1.1 da SPEC fica cancelada.

### Novos models (substituem as seções 1.2 a 1.4 da SPEC)

```prisma
model StandAccessToken {
  id         String    @id @default(uuid())
  standId    String
  stand      Stand     @relation(fields: [standId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique          // SHA-256 do token; nunca armazenar em claro
  createdBy  String?                    // id do admin
  createdAt  DateTime  @default(now())
  expiresAt  DateTime?
  revokedAt  DateTime?
  lastUsedAt DateTime?

  @@index([standId])
  @@map("stand_access_tokens")
}

model AuditLog {
  id              String   @id @default(uuid())
  standId         String?
  action          String   // 'PARTICIPANT_REMOVED' | 'TOKEN_GENERATED' | 'TOKEN_REVOKED' | 'PANEL_ACCESS'
  actorType       String   // 'stand_responsible' | 'admin'
  actorIdentifier String?  // email do responsável ou id/email do admin
  targetParticipantId String?
  targetSnapshot  Json?    // dados NÃO-sensíveis (nome, documento mascarado, createdAt). NUNCA biometria.
  reason          String?
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())

  @@index([standId, createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

### Campos novos em `Participant`

```prisma
status     String    @default("active")  // 'active' | 'removed'
removedAt  DateTime?
removedBy  String?                       // email do responsável ou admin
```

## 2. Ocupação: fonte da verdade e concorrência

- **Fonte da verdade** = `count(participants where standId = X and status = 'active')`. O `currentCount` passa a ser cache derivado: atualizado **dentro da mesma transação** de cadastro/remoção, nunca incrementado isoladamente fora dela.
- Validação de vaga no cadastro, em `prisma.$transaction` com lock pessimista na linha do stand:

```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM stands WHERE id = ${standId} FOR UPDATE`;
  const active = await tx.participant.count({ where: { standId, status: "active" } });
  if (active >= stand.maxRegistrations) throw new StandFullError();
  await tx.participant.create({ ... });
  await tx.stand.update({ where: { id: standId }, data: { currentCount: active + 1 } });
});
```

- Na remoção, mesma estrutura: marcar `status = 'removed'` e recalcular `currentCount = active - 1` na mesma transação.
- **Auditar usos existentes de `currentCount`** no código (listagens, validações antigas) e garantir que continuam coerentes com a nova regra.

## 3. E-mail (Fase 2)

- Instalar `resend`. Variável `RESEND_API_KEY` no `.env` e no Vercel (Production + Preview).
- Verificação do domínio `megacredenciamento.com.br` no painel do Resend: adicionar os registros DNS (DKIM/SPF/Return-Path) onde o DNS do domínio é gerenciado. Remetente sugerido: `credenciamento@megacredenciamento.com.br`.
- Template do e-mail: identidade Mega Feira (teal #2DD4BF / navy #1E3A5F, fonte Poppins), nome do evento e do stand, botão com o link, aviso de que o link pode ser compartilhado com a equipe mas dá acesso ao painel do stand.
- Enquanto o domínio não estiver verificado, usar o domínio sandbox do Resend em dev.

## 4. Remoção no Hikvision (Fase 5) — decisão

- **Usar o `deleteUser()` existente** em `lib/hikvision/client.ts` (`/ISAPI/AccessControl/UserInfo/Delete`): remover o usuário do dispositivo já elimina as faces vinculadas e revoga o acesso físico, que é exatamente o efeito desejado. **Não** implementar delete isolado no FDLib nesta fase.
- Se a chamada ISAPI falhar (dispositivo offline), não bloquear a exclusão: gravar flag no participante (`pendingDeviceRemoval Boolean @default(false)`) e reprocessar depois (job manual ou no próximo sync).

## 5. ⚠️ Ajuste obrigatório no `scripts/sync-faces-ivms.ts`

O script de sincronização hoje só cadastra. Após este projeto, ele **deve filtrar `status = 'active'`** em todas as queries de participantes. Sem isso, o sync iria **recadastrar no dispositivo** participantes já removidos, reabrindo o acesso físico de quem foi excluído. Tratar isso como parte da Fase 5, com teste cobrindo o cenário: participante removido → sync executado → participante NÃO retorna ao dispositivo.

Adicionalmente: ao remover, além de apagar o campo biométrico criptografado no Neon (conforme SPEC seção 2.4), processar a fila de `pendingDeviceRemoval` no início de cada sync.

## 6. Ordem de execução (mantida, com ajustes)

1. **Fase 1** — Models Prisma novos + campos em `Participant` (`prisma migrate dev` em branch de dev do Neon; depois `migrate deploy` em produção).
2. **Fase 2** — Resend + geração/revogação de token no admin + logs.
3. **Fase 3** — Painel `/stand/[token]` (ocupação via contagem de `active`, lista de participantes).
4. **Fase 4** — Cadastro via token + remoção da lista pública + transação de vagas (seção 2 deste adendo).
5. **Fase 5** — Exclusão com auditoria + `deleteUser()` + flag `pendingDeviceRemoval` + ajuste do sync (seção 5).
6. **Fase 6** — Página de auditoria no admin + testes (incluir o teste do sync com participante removido).

## Critérios de aceite adicionais

- [ ] `currentCount` permanece consistente com a contagem real após cadastros e remoções concorrentes.
- [ ] Sync do iVMS nunca recadastra participante com `status = 'removed'`.
- [ ] Exclusão com dispositivo offline conclui no sistema e marca `pendingDeviceRemoval` para reprocessamento.
