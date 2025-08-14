# 🚀 Guia de Deploy - NEON + Vercel

Este guia mostra como fazer deploy do sistema de cadastro facial usando NEON Database e Vercel.

## 📋 Pré-requisitos

- Conta GitHub
- Conta Vercel ([vercel.com](https://vercel.com))
- Conta NEON ([neon.tech](https://neon.tech))

## 🗄️ Passo 1: Configurar NEON Database

### 1.1 Criar Projeto NEON
```bash
1. Acesse https://neon.tech
2. Faça login/registro
3. Clique "Create Project"
4. Nome: facial-capture-mobile
5. Região: US East (ou mais próxima)
6. PostgreSQL version: 15 (padrão)
```

### 1.2 Obter Connection Strings
```bash
1. No painel NEON, vá em "Dashboard"
2. Copie a "Connection string"
3. Anote também a "Direct connection string"

# Exemplo das strings:
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/facial_db?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/facial_db?sslmode=require&connection_limit=1"
```

### 1.3 Configurar Schema
```bash
# Local (apenas uma vez)
npm install
npx prisma db push
```

## ☁️ Passo 2: Deploy no Vercel

### 2.1 Deploy via GitHub
```bash
1. Faça fork/clone do repositório
2. Acesse https://vercel.com/dashboard
3. Clique "New Project"
4. Importe do GitHub
5. Selecione o repositório facial-capture-mobile
```

### 2.2 Configurar Variáveis de Ambiente
No Vercel Dashboard → Settings → Environment Variables:

```env
# Database (obrigatório)
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require&connection_limit=1"

# Segurança (obrigatório)
MASTER_KEY="sua-chave-de-32-caracteres-aqui"

# Evento (opcional)
EVENT_CODE="MEGA-FEIRA-2025"
EVENT_NAME="Mega Feira 2025"
DATA_RETENTION_DAYS="90"
DPO_EMAIL="privacy@megafeira.com"
```

### 2.3 Deploy
```bash
1. Clique "Deploy"
2. Aguarde build (2-3 minutos)
3. ✅ Deploy concluído!
```

## 🔧 Passo 3: Configuração Pós-Deploy

### 3.1 Inicializar Database
```bash
# Via Vercel CLI (recomendado)
vercel env pull .env.local
npx prisma db push

# Ou via dashboard NEON SQL Editor
CREATE TABLE IF NOT EXISTS "participants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "cpf" TEXT UNIQUE NOT NULL,
  -- ... outros campos do schema
);
```

### 3.2 Testar Sistema
```bash
# Health Check
curl https://seu-app.vercel.app/api/health

# Resposta esperada:
{
  "status": "healthy",
  "checks": { "database": "ok" },
  "stats": { "totalParticipants": 0 }
}
```

### 3.3 Configurar Domínio (Opcional)
```bash
1. Vercel Dashboard → Settings → Domains
2. Adicione seu domínio customizado
3. Configure DNS (CNAME)
4. Aguarde propagação (15-30 min)
```

## 📱 Passo 4: Teste Mobile

### 4.1 Teste em Smartphones
```bash
1. Acesse https://seu-app.vercel.app
2. Permita acesso à câmera
3. Complete o fluxo de cadastro
4. Verifique no NEON console
```

### 4.2 PWA Install
```bash
1. Chrome/Safari → Menu → "Adicionar à tela inicial"
2. Teste funcionalidades offline
3. Verifique ícones e splash screen
```

## 🔒 Passo 5: Segurança & LGPD

### 5.1 Configurar Headers de Segurança
```json
// vercel.json (já configurado)
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000" }
      ]
    }
  ]
}
```

### 5.2 Configurar Data Retention
```sql
-- Job de limpeza automática (executar mensalmente)
DELETE FROM participants 
WHERE created_at < NOW() - INTERVAL '90 days';
```

## 📊 Passo 6: Monitoramento

### 6.1 Métricas Vercel
```bash
1. Vercel Dashboard → Analytics
2. Monitore: Requests, Errors, Performance
3. Configure alertas para erros 5xx
```

### 6.2 Monitoramento NEON
```bash
1. NEON Console → Monitoring
2. Monitore: Connections, CPU, Storage
3. Configure alertas de quota
```

### 6.3 Health Checks
```bash
# Endpoint de saúde
GET https://seu-app.vercel.app/api/health

# UptimeRobot ou similar
curl -f https://seu-app.vercel.app/api/health || exit 1
```

## 🚨 Troubleshooting

### Erro: Database Connection
```bash
# Verificar connection string
echo $DATABASE_URL

# Testar conexão direta
psql "$DATABASE_URL" -c "SELECT 1;"

# Verificar limites NEON
# Free tier: 10 concurrent connections
```

### Erro: Build Failed
```bash
# Verificar logs Vercel
vercel logs

# Limpar cache
vercel --force

# Verificar Node.js version
"engines": { "node": "18.x" }
```

### Erro: Camera Not Working
```bash
# Verificar HTTPS
# Câmera requer HTTPS em produção

# Verificar permissões
# Chrome → Settings → Privacy → Site Settings → Camera
```

### Erro: Prisma Generate
```bash
# Executar após mudança no schema
npx prisma generate
npx prisma db push

# No Vercel, adicionar postbuild:
"scripts": {
  "postbuild": "prisma generate"
}
```

## 🎯 Checklist de Deploy

### Pré-Deploy
- [ ] NEON database criado
- [ ] Connection strings copiadas
- [ ] Repository configurado
- [ ] Environment variables definidas

### Deploy
- [ ] Build successful no Vercel
- [ ] Database schema aplicado
- [ ] Health check respondendo
- [ ] APIs funcionando

### Pós-Deploy
- [ ] Teste completo mobile
- [ ] PWA instalável
- [ ] Performance adequada
- [ ] Monitoramento ativo

### Segurança
- [ ] HTTPS funcionando
- [ ] Headers de segurança ativos
- [ ] Dados biométricos criptografados
- [ ] LGPD compliance validado

## 📞 Suporte

### Problemas NEON
- [NEON Discord](https://discord.gg/92vNTzKDGp)
- [NEON Docs](https://neon.tech/docs)

### Problemas Vercel  
- [Vercel Support](https://vercel.com/help)
- [Vercel Docs](https://vercel.com/docs)

### Problemas Gerais
- GitHub Issues do projeto
- Email: suporte@megafeira.com

---

**Deploy realizado com sucesso! 🎉**

Seu sistema está rodando em:
- **Frontend**: https://seu-app.vercel.app
- **Database**: NEON PostgreSQL na nuvem
- **Performance**: Global CDN + Serverless functions