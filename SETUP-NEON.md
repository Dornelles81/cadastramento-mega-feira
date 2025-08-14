# 🗄️ SETUP NEON DATABASE

## ⚡ Passos Rápidos

### 1. Criar Conta NEON
1. **Acesse**: [neon.tech](https://neon.tech)
2. **Sign up** gratuito (pode usar GitHub)
3. **Create Project**:
   - Name: `mega-feira-db`
   - Region: **US East** (mais barato) ou **South America** (mais rápido)
4. **Aguarde** 30 segundos para provisionar

### 2. Obter Connection String
1. No dashboard do projeto, clique **"Connect"**
2. **Copie** a connection string:
   ```
   postgresql://username:password@hostname/dbname?sslmode=require
   ```
3. **Guarde** esta string - vamos usar na Vercel!

### 3. Configurar Variáveis
Você vai precisar dessas variáveis na Vercel:

```env
DATABASE_URL=postgresql://sua-connection-string-neon-aqui
DIRECT_DATABASE_URL=postgresql://sua-connection-string-neon-aqui  
MASTER_KEY=MinhaChaveSecreteaDe32CaracteresAqui
NEXTAUTH_SECRET=OutraChaveSuperSecretaProdução2025
```

## ✅ Pronto!
Quando terminar, continue com o deploy na Vercel!