# Teste de carga — 50 cadastros concorrentes (saturação de conexão)

## O que a análise encontrou (antes de rodar)

**Conexão** (`.env` / `lib/prisma.ts`)

- `DATABASE_URL` → endpoint **`-pooler`** (PgBouncer do Neon, modo *transaction*), com
  `connection_limit=10`, `pool_timeout=30`, `connect_timeout=30`.
- `DIRECT_URL` → endpoint sem pooler (migrations; e a sonda deste teste).
- `lib/prisma.ts` é singleton correto. O `globalForPrisma` só é setado fora de produção,
  mas em serverless o `const` de módulo já persiste por instância — sem vazamento.
- ⚠️ **`connection_limit=10` é POR INSTÂNCIA de PrismaClient.** Na Vercel, cada lambda
  quente tem o seu pool. 50 requests simultâneos podem virar N lambdas × 10 conexões
  de cliente contra o PgBouncer.
- ⚠️ `lib/hikvision/service.ts:7` faz `new PrismaClient()` no escopo do módulo — um
  **segundo pool** (+10) em qualquer lambda que carregue `/api/hikvision/*`. Não está no
  caminho do cadastro, mas dobra o consumo naquelas rotas.

**Custo de conexão por cadastro** (round-trips sequenciais, cada um segurando o pool):

| Rota | Queries fora de txn | Dentro de txn |
|---|---|---|
| `POST /api/register-fixed` | ~9 + T | — (nenhuma transação) |
| `POST /api/stand-registration` | ~7 + T | **4** (`FOR UPDATE` + count + create + update) |

`T` = terminais ativos do evento. O fan-out (`onBecameEligible`) roda **dentro do request**
e faz um `upsert` **sequencial por terminal** — é o multiplicador silencioso do tempo que
cada request segura uma conexão.

**As duas hipóteses que o teste existe para confirmar:**

1. **`stand-registration` serializa 50 requests num único `SELECT … FOR UPDATE`** da linha do
   stand. A transação **interativa do Prisma segura a conexão do pool enquanto espera o lock**.
   Os defaults do Prisma (`maxWait` 2s para *pegar* conexão, `timeout` 5s para a txn) devem
   cortar **antes** dos 50 — esperado **P2028**, não P2024.
2. **`register-fixed` não tem transação nem lock**: a checagem de vaga (`stand.findFirst` +
   `_count`) e o `participant.create` são passos separados → sob concorrência, o limite do
   stand pode ser **furado** (oversell). O teste mede isso contando os 201.

## Como rodar

**Não rode contra produção.** Suba um branch do Neon, aponte o `.env.local` para ele e rode
o app localmente em build de produção (`npm run build && npm start` — `next dev` distorce a
latência). Alvo remoto exige `--yes` explícito.

```bash
# Cenário A — cadastro comum (churn de conexão, sem lock)
npx tsx scripts/loadtest/run.ts --mode=register --event=expofest-2026 --n=50

# Cenário B — cadastro por stand (o caso de saturação de verdade)
npx tsx scripts/loadtest/run.ts --mode=stand --token=<TOKEN_DO_LINK> --n=50

# Limpeza (obrigatória — são participantes reais na tabela)
npx tsx scripts/loadtest/cleanup.ts --apply
```

Flags: `--n=50` `--face-kb=250` `--base=http://localhost:3000` `--yes`

Dois detalhes que o harness resolve e que **invalidariam o teste** se ignorados:

- **Rate limit**: `lib/rate-limit.ts` corta em 10 req/10min **por IP**. 50 requests da sua
  máquina = 40 × `429` e zero carga no banco. O runner manda um `X-Forwarded-For` distinto
  por VU (50 celulares = 50 IPs), que é o que `getClientIp` lê primeiro.
- **Barreira**: os 50 disparam ao mesmo tempo, com os payloads (base64 de 250 KB) já prontos.
  Saturação de pool é fenômeno de pico simultâneo; rampa não reproduz.

## Como ler o resultado

A sonda (`probe.ts`) amostra `pg_stat_activity` pelo `DIRECT_URL` a cada 250 ms. Como o
PgBouncer multiplexa, os backends que ela vê são as conexões de **servidor** realmente
ocupadas — é esse número que satura, não o de clientes.

| Sinal | Significado |
|---|---|
| `201 == n` e p95 baixo | Não saturou. O limite está acima de 50 — registre o pico de backends e suba o `--n`. |
| **`P2028`** (txn timeout) | A transação do stand não conseguiu conexão em 2s ou passou de 5s esperando o lock. **Hipótese 1 confirmada.** |
| **`P2024`** (pool timeout) | Pool de 10 esgotado por 30s. Saturação clássica de conexão. |
| `pico idle in tx` alto | Transações segurando conexão **sem trabalhar** — esperando o lock da linha do stand. É a assinatura do gargalo. |
| `pico esperando Lock` > 0 | Serialização na linha do stand, exatamente como previsto. |
| `pico total` perto de `max_connections` | Aí sim o teto é o compute do Neon, não o Prisma. |
| `429` | Rate limit vazou para o teste — o `X-Forwarded-For` não chegou (proxy sobrescrevendo?). Resultado inválido. |

`stand-registration` devolve **500 genérico** em erro de banco (não expõe `error.code`), então
no modo `stand` **leia o log do servidor** para ver P2024/P2028. `register-fixed` devolve o
`error.message` do Prisma em `details`, e o runner já destaca.

**Ajuste do cenário B antes de rodar:** se o stand tiver menos de 50 vagas livres, os
excedentes voltam `409 "Stand lotado"` *antes* de trabalhar no banco — você mede o lock, não a
saturação. O preflight avisa. Para medir saturação, `maxRegistrations >= 50`. Para testar
**não-overselling** (correção do lock), deixe as vagas menores e confira que os `201` batem
exatamente com as vagas livres.
