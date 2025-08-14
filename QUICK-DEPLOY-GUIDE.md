# ⚡ Quick Deploy Guide - Mega Feira Facial Recognition

## 🚀 Deploy em 5 Minutos

### 1️⃣ Criar Banco NEON (2 min)
1. Acesse [neon.tech](https://neon.tech) → Sign up gratuito
2. **Create Project** → Nome: `mega-feira`
3. **Copie** a connection string: `postgresql://...`

### 2️⃣ Push para GitHub (1 min)
```bash
# Se ainda não fez, conecte o repositório remoto:
git remote add origin https://github.com/SEU-USUARIO/mega-feira-facial.git
git branch -M main
git push -u origin main
```

### 3️⃣ Deploy na Vercel (2 min)
1. Acesse [vercel.com](https://vercel.com) → Login com GitHub
2. **New Project** → Selecione `mega-feira-facial`
3. **Environment Variables** → Adicione:
   ```env
   DATABASE_URL=postgresql://...sua-string-neon...
   DIRECT_DATABASE_URL=postgresql://...sua-string-neon...
   MASTER_KEY=SuaChaveSeguraEAqui32Caracteres
   NEXTAUTH_SECRET=OutraChaveSuperSecretaAqui456
   ```
4. **Deploy** → Aguarde 2-3 minutos

### ✅ Pronto! 
Seu app estará em: `https://mega-feira-facial.vercel.app`

---

## 🧪 Teste Rápido Pós-Deploy

### URLs para Testar
- **App Principal**: `https://seu-app.vercel.app`
- **Admin Panel**: `https://seu-app.vercel.app/admin` (senha: `admin123`)
- **Health Check**: `https://seu-app.vercel.app/api/health`
- **Export API**: `https://seu-app.vercel.app/api/export/participants`

### Fluxo de Teste
1. **Acesse** a URL principal
2. **Aceite** o termo de consentimento
3. **Preencha** dados: Nome, CPF, telefone, evento, mesa
4. **Simule** captura facial (clique em "Capturar Foto")
5. **Verifique** tela de sucesso
6. **Acesse** admin panel e veja o registro

---

## 🔧 Comandos de Manutenção

### Atualizar Aplicação
```bash
git add .
git commit -m "Update: sua mensagem"
git push origin main
# Deploy automático na Vercel
```

### Ver Logs
```bash
# Via Vercel dashboard → Functions → View logs
# Ou via CLI: vercel logs https://seu-app.vercel.app
```

### Backup de Dados
```bash
curl "https://seu-app.vercel.app/api/export/participants" -o backup.json
```

---

## 🆘 Problemas Comuns

| Problema | Solução |
|----------|---------|
| Build falha | Verificar variáveis de ambiente |
| Banco não conecta | SSL obrigatório no NEON |
| Câmera não funciona | HTTPS obrigatório |
| 404 nas APIs | Verificar estrutura pages/api/ |

---

## 📞 Suporte

- **GitHub Issues**: Reporte problemas
- **Documentation**: Ver README.md e API-EXPORT-DOCS.md
- **Quick Help**: DEPLOY-INSTRUCTIONS.md (guia completo)

**🎯 Sistema pronto para receber participantes da Mega Feira!**