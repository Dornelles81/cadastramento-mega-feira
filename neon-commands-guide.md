# 🚀 Guia de Comandos Rápidos - NEON + Sistema Facial

## 📋 Setup Inicial (Execute Uma Vez)

```bash
# 1. Salvar e executar o script de setup
chmod +x setup-neon.sh
./setup-neon.sh

# 2. Verificar se tudo foi instalado
cd Facial-Data-Collection
ls -la
```

## 🗄️ Comandos NEON Database

### Testar Conexão
```bash
# Via psql direto
psql 'postgresql://<user>:<senha>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require' -c "SELECT 1;"

# Via API
curl http://localhost:4000/health

# Ver versão do PostgreSQL
psql $DATABASE_URL -c "SELECT version();"
```

### Gerenciar Banco
```bash
# Abrir Prisma Studio (interface visual)
cd backend && npx prisma studio

# Executar migrações
cd backend && npx prisma migrate dev

# Reset do banco (CUIDADO: apaga tudo!)
cd backend && npx prisma migrate reset

# Gerar cliente Prisma
cd backend && npx prisma generate

# Ver schema atual
cd backend && npx prisma db pull
```

### Queries Úteis
```bash
# Contar participantes
psql $DATABASE_URL -c "SELECT COUNT(*) FROM participants;"

# Ver últimos cadastros
psql $DATABASE_URL -c "SELECT name, cpf, created_at FROM participants ORDER BY created_at DESC LIMIT 5;"

# Ver tamanho do banco
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('neondb'));"

# Ver conexões ativas
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Estatísticas gerais
psql $DATABASE_URL -c "
SELECT 
  (SELECT COUNT(*) FROM participants) as total_participants,
  (SELECT COUNT(*) FROM consent_records) as total_consents,
  (SELECT COUNT(*) FROM hikcenter_sync WHERE sync_status = 'pending') as pending_syncs;
"
```

## 🚀 Comandos de Desenvolvimento

### Iniciar Sistema
```bash
# Tudo de uma vez
docker-compose up -d && npm run dev

# Separadamente
# Terminal 1 - Serviços
docker-compose up -d

# Terminal 2 - Backend
cd backend && npm run dev

# Terminal 3 - Frontend  
cd frontend && npm run dev
```

### Parar Sistema
```bash
# Parar aplicação
Ctrl+C nos terminais

# Parar Docker
docker-compose down

# Parar e limpar tudo
docker-compose down -v
```

## 🧪 Comandos de Teste

### Testar API
```bash
# Health check
curl http://localhost:4000/health | jq

# Criar participante
curl -X POST http://localhost:4000/api/v1/registration \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "cpf": "12345678901",
    "email": "joao@teste.com",
    "eventCode": "TEST2025",
    "consent": {
      "accepted": true,
      "text": "Concordo com os termos"
    }
  }' | jq

# Listar participantes
curl http://localhost:4000/api/v1/participants | jq
```

### Teste de Carga
```bash
# Criar 100 registros de teste
for i in {1..100}; do
  curl -X POST http://localhost:4000/api/v1/registration \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Teste $i\",
      \"cpf\": \"00000000$i\",
      \"eventCode\": \"LOAD_TEST\",
      \"consent\": {
        \"accepted\": true,
        \"text\": \"Test consent\"
      }
    }"
done
```

## 🔧 Comandos de Manutenção

### Logs
```bash
# Ver logs do backend
cd backend && npm run dev 2>&1 | tee backend.log

# Ver logs do Docker
docker-compose logs -f

# Ver logs do NEON (queries lentas)
psql $DATABASE_URL -c "
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC 
LIMIT 10;
"
```

### Backup
```bash
# Backup do schema
cd backend && npx prisma migrate dev --create-only

# Exportar dados (usando pg_dump)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Exportar só estrutura
pg_dump $DATABASE_URL --schema-only > schema.sql

# Exportar dados específicos
psql $DATABASE_URL -c "\COPY participants TO 'participants.csv' CSV HEADER;"
```

### Otimização
```bash
# Analyze tabelas
psql $DATABASE_URL -c "ANALYZE participants;"

# Ver índices
psql $DATABASE_URL -c "\di"

# Criar índice adicional
psql $DATABASE_URL -c "CREATE INDEX CONCURRENTLY idx_participants_event ON participants(event_code);"

# Vacuum
psql $DATABASE_URL -c "VACUUM ANALYZE;"
```

## 📊 Monitoramento

### Dashboard Local
```bash
# Criar dashboard simples
cat > monitor.sh << 'EOF'
#!/bin/bash
while true; do
  clear
  echo "=== NEON Database Monitor ==="
  echo ""
  echo "Participantes:"
  psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM participants;"
  echo ""
  echo "Conexões ativas:"
  psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_stat_activity;"
  echo ""
  echo "Tamanho do banco:"
  psql $DATABASE_URL -t -c "SELECT pg_size_pretty(pg_database_size('neondb'));"
  echo ""
  echo "Health check:"
  curl -s http://localhost:4000/health | jq .status
  sleep 5
done
EOF

chmod +x monitor.sh
./monitor.sh
```

## 🐛 Troubleshooting

### Problemas Comuns

```bash
# Erro: "relation does not exist"
cd backend && npx prisma migrate dev

# Erro: "connection refused"
# Verificar .env
cat .env | grep DATABASE_URL

# Erro: "too many connections"
# Usar pooled connection
# Verificar se URL tem "-pooler" no host

# Erro: "SSL required"
# Adicionar ?sslmode=require na URL

# Limpar cache Prisma
cd backend && rm -rf node_modules/.prisma && npx prisma generate

# Reset completo
cd backend
npx prisma migrate reset --force
npx prisma generate
npx prisma migrate dev
```

## 🚢 Deploy para Produção

### Build
```bash
# Build frontend
cd frontend && npm run build

# Build backend  
cd backend && npm run build

# Criar imagem Docker
docker build -t facial-system .
```

### Variáveis de Produção
```bash
# Criar .env.production
cat > .env.production << EOF
NODE_ENV=production
DATABASE_URL="postgresql://<user>:<senha>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"
DIRECT_DATABASE_URL="postgresql://<user>:<senha>@<endpoint>.<region>.aws.neon.tech/neondb?sslmode=require"
EOF

# Executar migrações em produção
NODE_ENV=production npx prisma migrate deploy
```

## 📱 Teste Mobile

```bash
# Obter IP local
ip addr show | grep inet | grep -v 127.0.0.1

# Ou no Mac
ipconfig getifaddr en0

# Acessar do celular (mesma rede)
# https://SEU_IP:3000

# Gerar certificado SSL para teste local
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout key.pem -out cert.pem \
  -subj "/CN=localhost"

# Servir com HTTPS
npx serve -s frontend/dist --ssl-cert cert.pem --ssl-key key.pem
```

## 🎯 Comandos Específicos do Projeto

### Gestão de Participantes
```bash
# Buscar por CPF
psql $DATABASE_URL -c "SELECT * FROM participants WHERE cpf = '12345678901';"

# Deletar participante (LGPD)
psql $DATABASE_URL -c "DELETE FROM participants WHERE id = 'uuid-aqui';"

# Contar por evento
psql $DATABASE_URL -c "
SELECT event_code, COUNT(*) 
FROM participants 
GROUP BY event_code 
ORDER BY COUNT(*) DESC;
"

# Ver consentimentos revogados
psql $DATABASE_URL -c "
SELECT p.name, c.revoked_at 
FROM consent_records c 
JOIN participants p ON p.id = c.participant_id 
WHERE c.revoked_at IS NOT NULL;
"
```

### HikCenter Sync
```bash
# Ver pendentes de sincronização
psql $DATABASE_URL -c "
SELECT p.name, h.sync_status, h.sync_attempts 
FROM hikcenter_sync h 
JOIN participants p ON p.id = h.participant_id 
WHERE h.sync_status = 'pending';
"

# Resetar tentativas de sync
psql $DATABASE_URL -c "
UPDATE hikcenter_sync 
SET sync_attempts = 0, sync_status = 'pending' 
WHERE sync_status = 'failed';
"
```

## 📈 Métricas e KPIs

```bash
# Dashboard de métricas
psql $DATABASE_URL -c "
SELECT 
  'Total Participantes' as metric,
  COUNT(*)::text as value
FROM participants
UNION ALL
SELECT 
  'Cadastros Hoje',
  COUNT(*)::text
FROM participants 
WHERE DATE(created_at) = CURRENT_DATE
UNION ALL
SELECT 
  'Taxa de Consentimento',
  ROUND(100.0 * COUNT(*) FILTER (WHERE accepted = true) / NULLIF(COUNT(*), 0), 2) || '%'
FROM consent_records
UNION ALL
SELECT 
  'Sincronizações Pendentes',
  COUNT(*)::text
FROM hikcenter_sync 
WHERE sync_status = 'pending';
"
```

## 🔐 Segurança

```bash
# Rotacionar senha (criar novo usuário no NEON Dashboard)
# Atualizar .env com nova connection string

# Verificar SSL
psql $DATABASE_URL -c "SHOW ssl;"

# Ver conexões ativas
psql $DATABASE_URL -c "
SELECT pid, usename, application_name, client_addr, state 
FROM pg_stat_activity 
WHERE state != 'idle';
"

# Matar conexão específica
psql $DATABASE_URL -c "SELECT pg_terminate_backend(PID_AQUI);"
```

## 🌟 Atalhos Úteis

```bash
# Alias para comandos frequentes
echo "
alias neon-db='psql \$DATABASE_URL'
alias neon-studio='cd backend && npx prisma studio'
alias neon-logs='docker-compose logs -f'
alias neon-health='curl http://localhost:4000/health | jq'
alias neon-reset='cd backend && npx prisma migrate reset --force'
" >> ~/.bashrc

source ~/.bashrc
```

---

## 📞 Links Importantes

- **NEON Dashboard**: https://console.neon.tech
- **Prisma Docs**: https://www.prisma.io/docs
- **Projeto GitHub**: https://github.com/Dornelles81/Facial-Data-Collection
- **Status NEON**: https://status.neon.tech

---

**Dica:** Salve este guia como `COMMANDS.md` no seu projeto para referência rápida!