# 🔧 CONFIGURAÇÃO COMPLETA - INTEGRAÇÃO HIKCENTRAL

## ✅ **ALTERAÇÕES REALIZADAS**

### 1. **Arquivo `.env.local`**
```env
# HikCentral Professional Configuration
HIKCENTAL_URL="http://localhost:80"
HIKCENTAL_USERNAME="admin"
HIKCENTAL_PASSWORD="Index2016"
ADMIN_PASSWORD="admin123"
```

### 2. **API de Sincronização** (`pages/api/admin/sync-hikcental.ts`)
- URL Base: `http://localhost:80`
- Endpoint: `/api/acs/v1/person/single/add`
- Autenticação: Basic Auth (admin/Index2016)

### 3. **Interface Administrativa** (`app/admin/hikcental`)
- URL de acesso: http://localhost:3001/admin/hikcental
- Senha admin: `admin123`

## 📡 **ESTRUTURA DOS DADOS ENVIADOS AO HIKCENTRAL**

```json
{
  "employeeNo": "12345678900",        // CPF sem formatação
  "name": "Nome Completo",            // Nome do participante
  "userType": "normal",                // Tipo de usuário
  "Valid": {
    "enable": true,                   // Habilitado
    "beginTime": "2025-08-25T00:00:00Z",
    "endTime": "2025-11-23T23:59:59Z" // 90 dias de validade
  },
  "doorRight": "1",                   // Direito de acesso
  "RightPlan": [{
    "doorNo": 1,                      // Número da porta
    "planTemplateNo": "1"             // Template do plano
  }],
  "faceData": {                       // DADOS DA IMAGEM FACIAL
    "faceLibType": "blackFD",         // Tipo de biblioteca facial
    "libMatching": {
      "libID": "1",
      "FDID": "1",
      "FPID": "1"
    },
    "face": {
      "binaryData": "BASE64_DA_IMAGEM" // IMAGEM EM BASE64
    }
  }
}
```

## 🔍 **STATUS ATUAL DA CONFIGURAÇÃO**

### ✅ **O que está funcionando:**
1. ✅ Aplicação rodando em http://localhost:3001
2. ✅ Banco de dados PostgreSQL conectado (NEON)
3. ✅ 5 participantes de teste cadastrados
4. ✅ Interface administrativa acessível
5. ✅ API de sincronização configurada

### ⚠️ **Pendências para funcionar completamente:**

#### **1. VERIFICAR INSTALAÇÃO DO HIKCENTRAL**
O HikCentral Professional precisa estar instalado e rodando. Verifique:

**No Windows:**
1. Pressione `Win + R`, digite `services.msc`
2. Procure por serviços:
   - "HikCentral Service"
   - "HCP Web Service"
   - "HikCentral Professional"

**Verificar porta padrão:**
- HikCentral geralmente usa:
  - Porta 80 ou 8080 (HTTP)
  - Porta 443 ou 8443 (HTTPS)

#### **2. DESCOBRIR O ENDPOINT CORRETO**
Execute este comando para descobrir a estrutura da API:
```bash
# Teste manual com curl
curl -u admin:Index2016 http://localhost:80/api/
```

#### **3. CONFIGURAR CREDENCIAIS CORRETAS**
No HikCentral Professional:
1. Acesse o painel administrativo
2. Vá em **System → User Management**
3. Confirme ou crie usuário com permissões de API

## 📊 **FLUXO DA INTEGRAÇÃO**

```
1. APP Coleta Facial
   ↓
2. Salva no Banco PostgreSQL
   ↓
3. Admin aprova participante
   ↓
4. Clica em "Sincronizar" 
   ↓
5. API envia para HikCentral
   ↓
6. HikCentral salva pessoa + foto
   ↓
7. Disponível nos terminais
```

## 🚀 **COMO USAR**

### **1. Verificar se HikCentral está rodando:**
```bash
# Windows - verificar serviços
sc query | findstr HikCentral

# Ou tente acessar no navegador
http://localhost:80
http://localhost:8080
```

### **2. Acessar interface de sincronização:**
1. Abra: http://localhost:3001/admin/hikcental
2. Login com senha: `admin123`
3. Visualize participantes cadastrados
4. Clique em "Sincronizar"

### **3. Testar sincronização:**
```bash
# Use o script de teste
node scripts/test-hikcentral-api.js
```

## 🔴 **IMPORTANTE - AÇÃO NECESSÁRIA**

**Para a integração funcionar completamente, você precisa:**

1. **Confirmar que o HikCentral Professional está instalado**
   - Se não estiver, instale: [Download HikCentral](https://www.hikvision.com/en/support/download/software/)

2. **Descobrir a porta e caminho corretos da API**
   - Verifique a documentação do seu HikCentral
   - Ou consulte o administrador do sistema

3. **Atualizar o `.env.local` com a URL correta:**
```env
HIKCENTAL_URL="http://IP_CORRETO:PORTA_CORRETA"
```

## 📝 **LOGS E DIAGNÓSTICO**

### **Verificar logs do Next.js:**
Veja o console onde está rodando `npm run dev`

### **Testar conexão manualmente:**
```bash
# Teste básico
curl http://localhost:80

# Teste com autenticação
curl -u admin:Index2016 http://localhost:80/api/
```

### **Verificar banco de dados:**
```bash
npx prisma studio
```
Acesse: http://localhost:5555

## 🆘 **SUPORTE**

Se o HikCentral não estiver instalado ou você não tem acesso:

### **Alternativa 1: Mock API**
Podemos criar uma API simulada para testes

### **Alternativa 2: Integração Direta com Terminal**
Use a API `/api/admin/sync-hikvision` para enviar direto ao terminal Hikvision DS-K1T671M-L

### **Alternativa 3: Exportação Manual**
Use a funcionalidade de exportação Excel/CSV e importe manualmente no HikCentral

---

## ✅ **RESUMO DAS ALTERAÇÕES FEITAS**

1. ✅ Configurado `.env.local` para localhost:80
2. ✅ Criada API de sincronização (`sync-hikcental.ts`)
3. ✅ Criada interface administrativa (`/admin/hikcental`)
4. ✅ Adicionados 5 participantes de teste
5. ✅ Criados scripts de teste de conexão
6. ✅ Documentação completa criada

**A integração está pronta, apenas aguardando confirmação do endpoint correto do HikCentral!**