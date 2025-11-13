# 🗄️ Guia de Configuração NEON Database - Versão Robusta

## 📊 Requisitos do Projeto
- **Participantes**: até 4.000 registros
- **Estandes**: até 800 registros
- **Acessos Simultâneos**: 10 conexões
- **Performance**: < 500ms por query

---

## 🚀 Passo 1: Criar Projeto no NEON

### 1.1 Acessar NEON Console
1. Acesse https://console.neon.tech
2. Faça login ou crie uma conta
3. Clique em "New Project"

### 1.2 Configurações do Projeto
```
Nome do Projeto: cadastramento-mega-feira-prod
Região: US East (Ohio) ou South America (São Paulo) - escolha mais próxima
PostgreSQL Version: 16 (mais recente)
```

### 1.3 Plano Recomendado
Para suportar os requisitos, recomendo:

**Opção 1: Plano Scale (Recomendado)**
- ✅ 10+ conexões simultâneas
- ✅ 10 GB de storage (suficiente para 4000+ registros com imagens)
- ✅ Auto-scaling
- ✅ Connection pooling integrado
- 💰 ~$19/mês

**Opção 2: Plano Free (Teste/Desenvolvimento)**
- ⚠️ Limitado a 0.5 GB
- ⚠️ Máximo 10 conexões
- ⚠️ Pode ter throttling
- 💰 Grátis

### 1.4 Configurações Avançadas

#### Connection Pooler (IMPORTANTE)
```
✅ Ativar Pooled Connection
Modo: Transaction
Pool Size: 20 (para 10 acessos simultâneos + overhead)
```

#### Compute Settings
```
Compute Size: 0.25 - 1 CU (Compute Units)
Auto-suspend: 5 minutos (economiza custos)
Auto-scale: Habilitado
```

---

## 🔧 Passo 2: Configurar Connection String

Após criar o projeto, você receberá 2 connection strings:

### 2.1 Unpooled Connection (Direto)
```bash
# Para migrations e tarefas administrativas
postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### 2.2 Pooled Connection (Produção) - USE ESTA
```bash
# Para a aplicação (com pooling)
postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&pgbouncer=true
```

### 2.3 Configurar no .env.local
```env
# Connection String COM POOLING (produção)
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&pgbouncer=true&connection_limit=10"

# Connection String SEM POOLING (migrations)
DIRECT_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
```

---

## ⚡ Passo 3: Otimizações de Performance

### 3.1 Configurar Prisma Client (já implementado)
O arquivo `lib/prisma.ts` já está otimizado com:
- ✅ Singleton pattern
- ✅ Connection pooling
- ✅ Query logging em desenvolvimento

### 3.2 Índices do Banco (aplicar via migrations)
Vou criar os índices otimizados no próximo arquivo.

### 3.3 Connection Pooling Settings
```env
# Adicionar ao .env.local
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"
```

---

## 📈 Passo 4: Aplicar Schema e Índices

### 4.1 Primeiro Deploy
```bash
# 1. Configurar as URLs no .env.local
# 2. Gerar Prisma Client
npx prisma generate

# 3. Aplicar schema inicial
npx prisma db push

# 4. Verificar com Prisma Studio
npx prisma studio
```

### 4.2 Índices Adicionais (executar no console NEON)
```sql
-- Índices para performance em queries comuns
CREATE INDEX CONCURRENTLY idx_participants_cpf ON participants(cpf);
CREATE INDEX CONCURRENTLY idx_participants_stand ON participants("standId");
CREATE INDEX CONCURRENTLY idx_participants_approval ON participants("approvalStatus");
CREATE INDEX CONCURRENTLY idx_participants_created ON participants("createdAt" DESC);
CREATE INDEX CONCURRENTLY idx_stands_code ON stands(code);
CREATE INDEX CONCURRENTLY idx_stands_active ON stands("isActive") WHERE "isActive" = true;
CREATE INDEX CONCURRENTLY idx_sync_logs_participant ON hikcental_sync_logs("participantId");
```

---

## 🔍 Passo 5: Monitoramento

### 5.1 NEON Console Dashboard
Monitore em tempo real:
- Conexões ativas
- Query performance
- Storage usage
- Compute usage

### 5.2 Queries Lentas
No console NEON, ative:
```
Settings > Monitoring > Slow Query Log
Threshold: 500ms
```

### 5.3 Alertas
Configure alertas para:
- 80% de conexões usadas
- 80% de storage usado
- Queries > 1 segundo

---

## 📊 Passo 6: Estimativa de Recursos

### Storage Estimado
```
Participantes: 4000 registros
- Dados textuais: ~2 KB/registro = 8 MB
- Imagens faciais: ~50 KB/imagem = 200 MB
- Documentos: ~100 KB/documento (média 2/participante) = 800 MB
Total Participantes: ~1 GB

Estandes: 800 registros
- Dados: ~1 KB/registro = 800 KB
Total Estandes: ~1 MB

Logs e Auditoria: ~500 MB

TOTAL ESTIMADO: ~1.5 GB
Recomendado: Plano com 5-10 GB
```

### Conexões
```
Acessos simultâneos: 10
Overhead (APIs, cron jobs): +5
Pool size recomendado: 20 conexões
```

---

## 🛡️ Passo 7: Segurança

### 7.1 IP Whitelist (Opcional)
No NEON Console:
```
Settings > Security > IP Allow List
Adicionar IPs dos servidores Vercel
```

### 7.2 Backup Automático
```
Settings > Backups
Frequência: Diária
Retenção: 7 dias (Free) ou 30 dias (Scale)
```

### 7.3 Point-in-Time Recovery
Apenas no plano Scale:
- Recuperação para qualquer ponto nas últimas 7-30 dias

---

## 🚦 Passo 8: Teste de Carga

### 8.1 Teste Local
```bash
# Teste de conexões simultâneas
node test-db-connections.js
```

### 8.2 Métricas Esperadas
```
✅ Latência: < 100ms (queries simples)
✅ Throughput: 50+ queries/segundo
✅ Conexões: 10 simultâneas estáveis
✅ Uptime: 99.9%
```

---

## 📱 Passo 9: URLs de Configuração

### NEON Console
- Dashboard: https://console.neon.tech
- Documentação: https://neon.tech/docs
- Status: https://neon.tech/status
- Suporte: https://neon.tech/support

### Prisma
- Documentação: https://www.prisma.io/docs
- Connection Pooling: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

---

## ✅ Checklist de Implementação

- [ ] Criar projeto no NEON Console
- [ ] Escolher região apropriada
- [ ] Ativar connection pooling
- [ ] Copiar connection strings (pooled e unpooled)
- [ ] Configurar .env.local com ambas URLs
- [ ] Executar `npx prisma generate`
- [ ] Executar `npx prisma db push`
- [ ] Aplicar índices adicionais via SQL
- [ ] Testar conexão com `npx prisma studio`
- [ ] Configurar backups automáticos
- [ ] Configurar alertas de monitoramento
- [ ] Executar teste de carga
- [ ] Verificar latência e performance
- [ ] Documentar credenciais em local seguro

---

## 🆘 Troubleshooting

### Erro: "Too many connections"
```env
# Reduzir connection_limit
DATABASE_URL="...?connection_limit=5"
```

### Erro: "Connection timeout"
```env
# Aumentar timeout
DATABASE_URL="...?connect_timeout=30"
```

### Performance Lenta
1. Verificar índices estão aplicados
2. Analisar query plans com EXPLAIN
3. Considerar upgrade de compute size
4. Verificar região do banco vs servidor

---

## 💡 Dicas de Otimização

1. **Use sempre a URL com pooling** em produção
2. **Crie índices** para campos usados em WHERE, JOIN, ORDER BY
3. **Monitore queries lentas** regularmente
4. **Faça backups** antes de migrations grandes
5. **Use LIMIT** em queries que podem retornar muitos registros
6. **Pagination** para listas grandes
7. **Lazy loading** de imagens no frontend
8. **Cache** de queries frequentes

---

*Última atualização: 13/11/2025*
*Versão: 2.1.0*
