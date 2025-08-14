# 🚀 Instruções de Deploy - Mega Feira Facial Recognition

## 📋 Pré-requisitos Completos

### 1. Contas Necessárias
- [x] **GitHub** - Para versionamento do código
- [x] **Vercel** - Para hospedagem da aplicação  
- [x] **NEON** - Para banco PostgreSQL serverless

### 2. Ferramentas Locais
- [x] **Git** - Para controle de versão
- [x] **Node.js 18+** - Para desenvolvimento
- [x] **GitHub CLI** (opcional) - Para automação

---

## 🗄️ PASSO 1: Configurar Banco NEON

### 1.1 Criar Conta NEON
1. Acesse [neon.tech](https://neon.tech)
2. Crie uma conta gratuita
3. Clique em "Create Project"

### 1.2 Configurar Database
```sql
-- Nome do projeto: mega-feira-facial
-- Região: US East (us-east-1) ou SA East (sa-east-1)
-- PostgreSQL Version: 15+
```

### 1.3 Obter Connection Strings
Após criar o projeto, você receberá:

```env
# Connection string principal
DATABASE_URL="postgresql://username:password@hostname/dbname?sslmode=require"

# Connection string direta (para migrations)
DIRECT_DATABASE_URL="postgresql://username:password@hostname/dbname?sslmode=require"
```

### 1.4 Testar Conexão
```bash
# Testar conexão com o banco
npx prisma db push --preview-feature

# Verificar se tabelas foram criadas
npx prisma studio
```

---

## 🐙 PASSO 2: Criar Repositório GitHub

### 2.1 Criar Repositório (Interface Web)
1. Acesse [github.com](https://github.com)
2. Clique no botão **"New repository"**
3. Configure:
   - **Repository name**: `mega-feira-facial`
   - **Description**: `🎯 Sistema de Reconhecimento Facial - Mega Feira 2025`
   - **Visibility**: Public ou Private
   - **Initialize**: ⚠️ **NÃO** marque nenhuma opção (README, .gitignore, license)
4. Clique em **"Create repository"**

### 2.2 Conectar Repositório Local
```bash
# Adicionar remote origin (substitua SEU-USUARIO)
git remote add origin https://github.com/SEU-USUARIO/mega-feira-facial.git

# Renomear branch para main (padrão moderno)
git branch -M main

# Fazer primeiro push
git push -u origin main
```

### 2.3 Verificar Upload
Acesse seu repositório no GitHub e confirme que todos os arquivos foram enviados.

---

## ☁️ PASSO 3: Deploy na Vercel

### 3.1 Criar Conta Vercel
1. Acesse [vercel.com](https://vercel.com)
2. Faça login com sua conta GitHub
3. Autorize a integração entre Vercel e GitHub

### 3.2 Importar Projeto
1. No dashboard da Vercel, clique em **"New Project"**
2. Selecione o repositório `mega-feira-facial`
3. Configure as opções:
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

### 3.3 Configurar Variáveis de Ambiente
Antes de fazer o deploy, configure as seguintes variáveis:

```env
# Database (obrigatórias)
DATABASE_URL=postgresql://username:password@hostname/dbname?sslmode=require
DIRECT_DATABASE_URL=postgresql://username:password@hostname/dbname?sslmode=require

# Security (obrigatórias) 
MASTER_KEY=sua-chave-de-32-caracteres-muito-segura
NEXTAUTH_SECRET=sua-chave-nextauth-super-secreta

# Application (opcionais)
NEXT_PUBLIC_APP_URL=https://seu-app.vercel.app
NEXT_PUBLIC_APP_NAME=Mega Feira Facial Recognition
```

### 3.4 Deploy
1. Clique em **"Deploy"**
2. Aguarde o build (2-5 minutos)
3. ✅ Seu app estará disponível em: `https://mega-feira-facial.vercel.app`

---

## ⚙️ PASSO 4: Configuração Pós-Deploy

### 4.1 Executar Migrations
```bash
# Se necessário, rodar migrations na produção
npx prisma db push --force-reset
```

### 4.2 Testar Aplicação
Acesse sua URL da Vercel e teste:

1. **Homepage**: Carregamento do formulário
2. **Consent**: Aceitar termos LGPD
3. **Form**: Preencher dados (nome, CPF, telefone, evento, mesa)
4. **Capture**: Simulação de captura facial
5. **Success**: Confirmação de cadastro
6. **Admin**: Acesso com senha `admin123`

### 4.3 Configurar Domínio Personalizado (Opcional)
1. Na Vercel, vá em "Domains"
2. Adicione seu domínio personalizado
3. Configure DNS conforme instruções
4. Aguarde propagação (até 48h)

---

## 🔧 PASSO 5: Monitoramento e Manutenção

### 5.1 Logs e Debugging
```bash
# Ver logs da Vercel
vercel logs https://seu-app.vercel.app

# Ver logs em tempo real
vercel dev --inspect
```

### 5.2 Atualizações
```bash
# Para atualizar a aplicação
git add .
git commit -m "Sua mensagem de commit"
git push origin main

# Deploy automático na Vercel será executado
```

### 5.3 Backup de Dados
```bash
# Backup do banco NEON (via dashboard NEON)
# Export de participantes via API
curl "https://seu-app.vercel.app/api/export/participants" -o backup.json
```

---

## 🆘 Troubleshooting

### Problema: Build falha na Vercel
**Solução**: Verificar logs na aba "Functions" da Vercel

### Problema: Conexão com banco falha  
**Solução**: Verificar connection strings e SSL obrigatório

### Problema: Câmera não funciona
**Solução**: HTTPS é obrigatório - verificar se está acessando via https://

### Problema: Upload de imagem falha
**Solução**: Verificar limite de 50MB da Vercel para functions

---

## 📋 Checklist Final

### Deploy Completo ✅
- [ ] Banco NEON configurado e funcionando
- [ ] Repositório GitHub criado e código enviado  
- [ ] Aplicação deployada na Vercel
- [ ] Variáveis de ambiente configuradas
- [ ] Testes básicos funcionando
- [ ] Admin panel acessível
- [ ] APIs de exportação operacionais

### URLs Importantes
- **Aplicação**: `https://seu-app.vercel.app`
- **Admin**: `https://seu-app.vercel.app/admin`
- **API Health**: `https://seu-app.vercel.app/api/health`
- **Export API**: `https://seu-app.vercel.app/api/export/participants`

### Credenciais de Acesso
- **Admin Panel**: senha = `admin123`
- **Database**: Via connection strings NEON
- **Vercel**: Via GitHub login

---

## 🎯 Próximos Passos

1. **Integração com Ultrathink**: Usar API `/api/export/participants?format=ultrathink`
2. **Monitoramento**: Configurar alertas na Vercel
3. **Performance**: Otimizar imagens e caching
4. **Segurança**: Implementar autenticação JWT (produção)
5. **Analytics**: Adicionar Google Analytics ou similares

---

**✨ Parabéns! Seu sistema Mega Feira está no ar!**

Para suporte: consulte README.md ou API-EXPORT-DOCS.md