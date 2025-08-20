# 📋 Guia de Configuração HikCentral - Mega Feira

## 🔍 Status da Verificação

### Dispositivo Detectado na Rede
- **IP**: 192.168.1.20
- **Porta**: 8000 (porta padrão Hikvision)
- **Status**: Conexão ativa detectada

## 🚀 Como Obter Credenciais do HikCentral

### Opção 1: Acessar Interface Web (RECOMENDADO)

1. **Acesse o painel do HikCentral**:
   ```
   http://192.168.1.20:8000
   ou
   http://192.168.1.20
   ```

2. **Login Padrão** (se não foi alterado):
   - **Usuário**: admin
   - **Senha**: admin12345 ou a1234567

3. **Navegue até Configurações da API**:
   - Sistema → Configurações → API
   - ou
   - Configuração → Sistema → Serviços Web

4. **Gere as Credenciais da API**:
   - Clique em "Gerar Nova API Key"
   - Copie:
     - API Key
     - API Secret
     - URL Base do Servidor

### Opção 2: Usar Software HikCentral Control Client

1. **Download do Cliente** (se não instalado):
   - https://www.hikvision.com/en/support/download/software/
   - Procure por "HikCentral Professional"

2. **Após Login**:
   - Vá em: Sistema → Gerenciamento de Usuários → API Access
   - Crie novo usuário de API ou use existente
   - Anote as credenciais geradas

### Opção 3: Credenciais via Administrador

Se você tem acesso SSH/Terminal ao servidor HikCentral:

```bash
# Linux/Unix
cat /opt/hikvision/web/config/api.conf

# Windows (se instalado localmente)
type "C:\HikCentral\config\api.conf"
```

## 🔧 Configuração no Sistema Mega Feira

### 1. Arquivo .env.local

Adicione estas variáveis ao arquivo `.env.local`:

```env
# HikCentral API Configuration
HIKCENTER_URL=http://192.168.1.20:8000
HIKCENTER_API_KEY=sua_api_key_aqui
HIKCENTER_API_SECRET=sua_api_secret_aqui
HIKCENTER_USER=admin
HIKCENTER_PASS=sua_senha_aqui

# Optional - Advanced Settings
HIKCENTER_FACE_LIBRARY_ID=1
HIKCENTER_BATCH_SIZE=100
HIKCENTER_RATE_LIMIT=10
```

### 2. Teste de Conexão Manual

Para testar se o HikCentral está acessível:

```bash
# Teste básico de conectividade
curl -X GET http://192.168.1.20:8000/api/system/deviceInfo

# Com autenticação (substitua as credenciais)
curl -X GET http://192.168.1.20:8000/api/acs/v1/person/list \
  -H "X-Api-Key: SUA_API_KEY" \
  -H "X-Api-Secret: SUA_API_SECRET"
```

## 📡 Endpoints Principais do HikCentral

### API Base URLs Comuns:
- `/api/acs/v1/` - Access Control System API
- `/api/resource/v1/` - Resource Management API
- `/api/event/v1/` - Event Management API
- `/api/irds/v1/` - Face Recognition API

### Endpoints Essenciais:
1. **Adicionar Pessoa**: POST `/api/acs/v1/person/single`
2. **Upload de Face**: POST `/api/irds/v1/face/single`
3. **Verificar Status**: GET `/api/system/status`
4. **Listar Pessoas**: GET `/api/acs/v1/person/list`

## 🔐 Tipos de Autenticação Suportados

### 1. API Key + Secret (Recomendado)
```javascript
headers: {
  'X-Api-Key': 'YOUR_API_KEY',
  'X-Api-Secret': 'YOUR_API_SECRET',
  'Content-Type': 'application/json'
}
```

### 2. Digest Authentication
```javascript
auth: {
  username: 'admin',
  password: 'password',
  type: 'digest'
}
```

### 3. Token Bearer
```javascript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN',
  'Content-Type': 'application/json'
}
```

## 🛠️ Instalação do HikCentral (Se Necessário)

### Requisitos Mínimos:
- **SO**: Windows Server 2016+ ou Linux (CentOS 7+, Ubuntu 18.04+)
- **CPU**: Intel i5 ou superior
- **RAM**: 8GB mínimo (16GB recomendado)
- **HD**: 100GB livres
- **Rede**: Gigabit Ethernet

### Download:
1. Acesse: https://www.hikvision.com/en/support/download/software/
2. Procure: "HikCentral Professional V2.5.1" (ou versão mais recente)
3. Registre-se para download gratuito

### Instalação Windows:
1. Execute o instalador como Administrador
2. Escolha "Complete Installation"
3. Configure:
   - Porta Web: 80 ou 8080
   - Porta HTTPS: 443 ou 8443
   - Database: PostgreSQL (incluído)
4. Anote credenciais do primeiro acesso

## 🧪 Teste Rápido via Interface

Após configurar as credenciais no `.env.local`:

1. **Reinicie o servidor Next.js**:
   ```bash
   npm run dev
   ```

2. **Acesse o admin**:
   ```
   http://localhost:3002/admin/hikcental
   ```

3. **Vá na aba "Configurações"**:
   - Insira a URL: http://192.168.1.20:8000
   - Insira API Key e Secret
   - Clique em "Testar Conexão"

## ⚠️ Problemas Comuns

### 1. Erro de Conexão
- Verifique firewall (libere porta 8000)
- Confirme IP correto: `ping 192.168.1.20`
- Teste no navegador: http://192.168.1.20:8000

### 2. Credenciais Inválidas
- Resete senha via console do servidor
- Verifique se API está habilitada
- Confirme tipo de autenticação (API Key vs Digest)

### 3. CORS Error
- Configure CORS no HikCentral
- Use proxy no Next.js
- Configure headers apropriados

## 📞 Suporte Hikvision

- **Site**: https://www.hikvision.com/pt-br/
- **Suporte Brasil**: +55 11 3090-1120
- **Email**: support.brazil@hikvision.com
- **Documentação API**: https://open.hikvision.com/docs/

## ✅ Próximos Passos

1. ✅ Acesse http://192.168.1.20:8000 no navegador
2. ⏳ Faça login com credenciais de admin
3. ⏳ Navegue até configurações de API
4. ⏳ Gere/copie as credenciais
5. ⏳ Configure no arquivo .env.local
6. ⏳ Teste a conexão na interface admin

---

📅 Documento criado em: 19/08/2025
🔧 Para: Sistema de Cadastramento Mega Feira