# 🚀 Guia de Deploy no Vercel - Mega Feira 2025

## 📋 Passo a Passo Completo

### 1️⃣ Executar o comando de deploy

Abra o terminal na pasta do projeto e execute:

```bash
vercel
```

### 2️⃣ Responder as perguntas do Vercel

Quando o Vercel perguntar, responda exatamente assim:

```
? Set up and deploy "D:\Projetos\Cadastramento Mega Feira"? 
👉 Digite: Y (ou Yes) e pressione Enter

? Which scope do you want to deploy to? 
👉 Selecione seu usuário/organização com as setas e pressione Enter

? Link to existing project? 
👉 Digite: N (ou No) e pressione Enter

? What's your project's name? 
👉 Digite: megafeira2025 e pressione Enter

? In which directory is your code located? 
👉 Apenas pressione Enter (vai usar ./)

? Want to modify these settings? [y/N]
👉 Digite: N e pressione Enter
```

### 3️⃣ Aguardar o Deploy

O Vercel vai:
- 📦 Fazer upload dos arquivos
- 🔨 Buildar o projeto
- ⚡ Fazer o deploy
- 🔗 Gerar uma URL de preview

Você verá algo assim:
```
🔍 Inspect: https://vercel.com/seu-usuario/megafeira2025/xxxxx
✅ Preview: https://megafeira2025-xxxxx.vercel.app
```

### 4️⃣ Deploy para Produção

Após o preview funcionar, faça o deploy final:

```bash
vercel --prod
```

Isso gerará a URL definitiva:
```
🔗 Production: https://megafeira2025.vercel.app
```

---

## ⚙️ Configurar Variáveis de Ambiente no Vercel

### Acesse o Dashboard do Vercel:

1. Vá para: https://vercel.com/dashboard
2. Clique no projeto `megafeira2025`
3. Vá em **Settings** → **Environment Variables**
4. Adicione as seguintes variáveis:

### Variáveis Obrigatórias:

```env
DATABASE_URL = postgresql://neondb_owner:npg_bim91SUWGAPJ@ep-wandering-waterfall-acykvygu-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

DIRECT_URL = postgresql://neondb_owner:npg_bim91SUWGAPJ@ep-wandering-waterfall-acykvygu-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

MASTER_KEY = a1b2c3d4e5f6789012345678901234567890abcd

ADMIN_PASSWORD = admin123
```

### Variáveis Opcionais (se quiser usar):

```env
EVENT_CODE = MEGA-FEIRA-2025
EVENT_NAME = Mega Feira 2025
DATA_RETENTION_DAYS = 90
DPO_EMAIL = privacy@megafeira.com

# Para HikCentral (não funcionará no Vercel cloud, apenas local)
HIKVISION_DEVICE_IP = 192.168.1.20
HIKVISION_USER = admin
HIKVISION_PASSWORD = Index2016
```

### Como adicionar cada variável:

1. Clique em **Add New**
2. Preencha:
   - **Key**: Nome da variável (ex: DATABASE_URL)
   - **Value**: Valor da variável
   - **Environment**: Selecione todos (Production, Preview, Development)
3. Clique em **Save**

---

## 🔄 Após Configurar as Variáveis

Execute um novo deploy para aplicar as configurações:

```bash
vercel --prod --force
```

---

## 📱 URLs Importantes

Após o deploy, você terá:

- **Aplicação**: https://megafeira2025.vercel.app
- **Admin**: https://megafeira2025.vercel.app/admin
- **Aprovações**: https://megafeira2025.vercel.app/admin/approvals

---

## ⚠️ Notas Importantes

### Sobre o HikCentral:
- A integração com HikCentral/Hikvision **NÃO funcionará** no Vercel
- O Puppeteer e acesso à rede local só funcionam em servidor local
- Para usar HikCentral, mantenha um servidor local rodando

### Sobre o Banco de Dados:
- O Neon PostgreSQL funciona perfeitamente no Vercel
- Todos os dados são salvos e sincronizados
- O banco já está configurado e pronto

### Sobre Imagens:
- As imagens são salvas como base64 no banco de dados
- Não há necessidade de storage externo
- Funciona perfeitamente no Vercel

---

## 🆘 Troubleshooting

### Se der erro de build:
```bash
# Limpe o cache e tente novamente
vercel --prod --force
```

### Se der erro de banco de dados:
- Verifique se adicionou DATABASE_URL nas variáveis de ambiente
- Certifique-se que copiou a URL completa com ?sslmode=require

### Se o admin não funcionar:
- Verifique se adicionou ADMIN_PASSWORD nas variáveis de ambiente
- Use a senha configurada para acessar

---

## ✅ Checklist Final

- [ ] Deploy preview funcionando
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy de produção realizado
- [ ] Teste de cadastro funcionando
- [ ] Admin panel acessível
- [ ] Banco de dados conectado

---

## 📞 Suporte

Se precisar de ajuda:
1. Verifique os logs em: https://vercel.com/seu-usuario/megafeira2025/logs
2. Teste localmente com: `npm run dev`
3. Verifique o banco em: Prisma Studio (`npx prisma studio`)

---

**Pronto! Seu sistema está no ar! 🎉**