# 🎯 Mega Feira - Sistema de Reconhecimento Facial

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/seu-usuario/mega-feira-facial)
[![LGPD Compliant](https://img.shields.io/badge/LGPD-Compliant-green.svg)](https://lgpd.gov.br/)
[![Mobile First](https://img.shields.io/badge/Mobile-First-blue.svg)]()

Sistema completo de cadastramento com reconhecimento facial para eventos, desenvolvido com **Next.js 14**, **TypeScript**, **NEON PostgreSQL** e **Vercel**.

## 🎯 **Características Principais**

- ✅ **100% Mobile-First** - Otimizado para smartphones Android/iOS
- ✅ **Captura Facial em Tempo Real** - MediaPipe + WebRTC
- ✅ **NEON Database** - PostgreSQL serverless na nuvem
- ✅ **Deploy Vercel** - Serverless functions + CDN global
- ✅ **LGPD Compliant** - Consent management + data retention
- ✅ **PWA Ready** - Install prompt + offline capability
- ✅ **Ultra Simples** - 4 passos: Consent → Dados → Foto → Sucesso

## 🚀 **Deploy Rápido**

### 1. Clique no botão "Deploy with Vercel" acima

### 2. Configure as variáveis de ambiente:
```env
DATABASE_URL=postgresql://user:pass@hostname/db?sslmode=require
DIRECT_URL=postgresql://user:pass@hostname/db?sslmode=require
MASTER_KEY=your-32-character-encryption-key
EVENT_CODE=MEGA-FEIRA-2025
EVENT_NAME=Mega Feira 2025
```

### 3. Deploy automático! 🎉

## 📱 **Experiência Mobile**

### UX Otimizada para Smartphones
- **Tela de Consentimento** - Termos LGPD claros e simples
- **Formulário de Dados** - Validação CPF + formatação automática
- **Captura Facial** - Detecção em tempo real + feedback visual
- **Tela de Sucesso** - Confirmação + instruções para o evento

### Tecnologias Mobile-First
- **MediaPipe Face Detection** - Reconhecimento facial no browser
- **Framer Motion** - Animações fluidas
- **Tailwind CSS** - Design system responsivo
- **PWA Manifest** - Instalação como app nativo

## 🏗️ **Arquitetura Técnica**

### Frontend (Next.js 14)
```
app/
├── layout.tsx          # Layout global mobile-first
├── page.tsx           # Página principal (stepper)
├── globals.css        # Estilos mobile otimizados
└── components/
    ├── ConsentForm.tsx     # Termo de consentimento LGPD
    ├── PersonalDataForm.tsx # Formulário de dados pessoais  
    ├── FacialCapture.tsx   # Captura facial com MediaPipe
    └── SuccessScreen.tsx   # Tela de confirmação
```

### Backend (Vercel Serverless)
```
pages/api/
├── register.ts      # API principal de cadastro
├── health.ts       # Health check + métricas
└── participants.ts # Consulta participantes (admin)
```

### Database (NEON PostgreSQL)
```sql
-- Tabela principal (schema Prisma)
model Participant {
  id              String   @id @default(uuid())
  name            String
  cpf             String   @unique
  email           String?
  faceData        Bytes?   -- Dados biométricos criptografados
  consentAccepted Boolean
  consentIp       String?
  consentDate     DateTime?
  captureQuality  Float?   -- Score de qualidade facial
  createdAt       DateTime @default(now())
}
```

## 🔒 **Segurança & LGPD**

### Conformidade LGPD
- **Base Legal**: Consentimento explícito do titular
- **Minimização**: Coleta apenas dados necessários
- **Finalidade**: Acesso ao evento por reconhecimento facial
- **Retenção**: Exclusão automática em 90 dias
- **Criptografia**: AES-256 para dados biométricos
- **Auditoria**: Logs de todas as operações

### Medidas Técnicas
```typescript
// Criptografia AES-256 para dados biométricos
function encryptBiometricData(data: string): Buffer {
  const key = Buffer.from(process.env.MASTER_KEY!, 'utf8')
  const cipher = crypto.createCipher('aes-256-gcm', key)
  // ... implementação segura
}

// Validação CPF com algoritmo brasileiro
function validateCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '')
  // ... validação dos dígitos verificadores
}
```

## 📊 **APIs Disponíveis**

### POST `/api/register`
Cadastro de novo participante
```json
{
  "name": "João Silva",
  "cpf": "123.456.789-00", 
  "email": "joao@email.com",
  "faceImage": "data:image/jpeg;base64,...",
  "consent": true
}
```

### GET `/api/health`
Health check do sistema
```json
{
  "status": "healthy",
  "checks": { "database": "ok" },
  "stats": {
    "totalParticipants": 1250,
    "registrationsToday": 85
  }
}
```

### GET `/api/participants`
Lista participantes (admin)
```json
{
  "participants": [...],
  "pagination": {
    "page": 1,
    "total": 1250,
    "totalPages": 63
  }
}
```

## 🛠️ **Desenvolvimento Local**

```bash
# Clone o repositório
git clone https://github.com/Dornelles81/facial-capture-mobile.git
cd facial-capture-mobile

# Instale as dependências
npm install

# Configure o ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais NEON

# Configure o banco
npx prisma db push

# Inicie o desenvolvimento
npm run dev
```

### Testando em Dispositivos Móveis
```bash
# Acesse via IP local (HTTPS necessário para câmera)
https://192.168.1.100:3000

# Ou use ngrok para tunnel HTTPS
npx ngrok http 3000 --host-header="localhost:3000"
```

## 📈 **Performance & Métricas**

### Targets de Performance
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s  
- **Camera Initialization**: < 3s
- **Face Detection Latency**: < 100ms
- **API Response Time**: < 2s (p95)

### Monitoramento
- **Health Check**: `/api/health`
- **Error Tracking**: Console logs + Vercel Analytics
- **Usage Metrics**: Registration counters + timestamps

## 🎪 **Como Usar no Evento**

### Para Participantes
1. **Acesse** o link no smartphone
2. **Aceite** o termo de consentimento  
3. **Preencha** seus dados pessoais
4. **Capture** sua foto facial (3 segundos)
5. **Pronto!** Acesso liberado por reconhecimento

### Para Administradores  
- **Dashboard**: `/api/participants` (lista cadastrados)
- **Health Check**: `/api/health` (status do sistema)
- **Métricas**: Total de registros + registros do dia

## 🔧 **Configuração NEON Database**

1. **Crie conta** em [neon.tech](https://neon.tech)
2. **Crie database** PostgreSQL
3. **Copie connection string** com SSL
4. **Configure variáveis** no Vercel:
   ```
   DATABASE_URL=postgresql://...?sslmode=require
   DIRECT_URL=postgresql://...?sslmode=require  
   ```
5. **Deploy schema**: `npx prisma db push`

## ☁️ **Deploy Production**

### Vercel (Recomendado)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configure environment variables
vercel env add DATABASE_URL
vercel env add MASTER_KEY

# Deploy production
vercel --prod
```

### Variáveis de Ambiente Obrigatórias
- `DATABASE_URL` - NEON connection string
- `DIRECT_URL` - NEON direct connection (migrations)
- `MASTER_KEY` - 32 characters encryption key

## 📞 **Suporte**

- **Issues**: [GitHub Issues](https://github.com/Dornelles81/facial-capture-mobile/issues)
- **Email**: suporte@megafeira.com
- **WhatsApp**: +55 11 99999-9999

## 📝 **Licença**

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

**Criado com 💙 para Mega Feira 2025**  
*Sistema mobile-first, LGPD compliant, powered by NEON + Vercel*