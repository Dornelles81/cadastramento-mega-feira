# 🎥 Configuração Hikvision NVR/DVR - Sistema Mega Feira

## ✅ Dispositivo Identificado

- **Tipo**: NVR/DVR Hikvision (não é HikCentral)
- **IP**: 192.168.1.20
- **Portas**:
  - **Porta 80**: Interface Web (HTTP)
  - **Porta 8000**: SDK/API (comando e controle)
  - **Porta 554**: RTSP (streaming de vídeo)

## 🔐 Como Acessar o NVR

### 1. Interface Web
```
http://192.168.1.20
```

### 2. Credenciais Padrão Hikvision
- **Usuário**: admin
- **Senhas comuns**:
  - admin (versões antigas)
  - admin12345
  - 12345
  - a1234567
  - Hik12345

### 3. Se a senha foi alterada
- Verifique com o responsável pela instalação
- Use o botão RESET no dispositivo físico (se disponível)
- Use o SADP Tool da Hikvision para resetar

## 🛠️ Integração com Sistema Mega Feira

### Opção 1: SDK ISAPI (Recomendado)

O NVR Hikvision suporta ISAPI (Internet Server Application Programming Interface):

```javascript
// Exemplo de integração
const hikvisionAPI = {
  baseURL: 'http://192.168.1.20',
  auth: {
    username: 'admin',
    password: 'sua_senha'
  },
  endpoints: {
    // Gerenciamento de usuários
    addUser: '/ISAPI/AccessControl/UserInfo/Record?format=json',
    getUserList: '/ISAPI/AccessControl/UserInfo/Search?format=json',
    deleteUser: '/ISAPI/AccessControl/UserInfo/Delete',
    
    // Upload de faces
    addFace: '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
    searchFace: '/ISAPI/Intelligent/FDLib/FDSearch',
    
    // Controle de acesso
    getAccessLog: '/ISAPI/AccessControl/AcsEvent?format=json',
    openDoor: '/ISAPI/AccessControl/RemoteControl/door/1'
  }
}
```

### Opção 2: Usar HikCentral Professional (Software Separado)

HikCentral é um software de gerenciamento centralizado que pode ser instalado para gerenciar múltiplos NVRs:

1. **Download**: https://www.hikvision.com/en/support/download/software/
2. **Instalação**: Windows Server ou Linux
3. **Adicionar NVR**: Use o IP 192.168.1.20

### Opção 3: Integração Direta via SDK

```bash
# Teste de API ISAPI
curl -X GET http://admin:senha@192.168.1.20/ISAPI/System/deviceInfo

# Adicionar pessoa com face
curl -X POST http://admin:senha@192.168.1.20/ISAPI/AccessControl/UserInfo/Record?format=json \
  -H "Content-Type: application/json" \
  -d '{
    "UserInfo": {
      "employeeNo": "001",
      "name": "João Silva",
      "userType": "normal",
      "Valid": {
        "enable": true,
        "beginTime": "2025-01-01T00:00:00",
        "endTime": "2025-12-31T23:59:59"
      }
    }
  }'
```

## 📋 Configuração no Sistema Mega Feira

### Atualizar .env.local

```env
# Hikvision NVR Configuration (não é HikCentral)
HIKVISION_NVR_IP="192.168.1.20"
HIKVISION_NVR_PORT="80"
HIKVISION_SDK_PORT="8000"
HIKVISION_USER="admin"
HIKVISION_PASSWORD="sua_senha_aqui"
HIKVISION_USE_ISAPI="true"

# Se usar HikCentral (software separado)
HIKCENTER_URL="http://localhost:8080"  # Se instalado localmente
HIKCENTER_API_KEY=""
HIKCENTER_API_SECRET=""
```

## 🔧 Ferramentas Úteis Hikvision

### 1. SADP Tool
- **Função**: Descobrir e configurar dispositivos Hikvision na rede
- **Download**: https://www.hikvision.com/en/support/tools/hitools/

### 2. iVMS-4200
- **Função**: Software cliente para gerenciar NVRs
- **Download**: https://www.hikvision.com/en/support/download/software/

### 3. Hik-Connect
- **Função**: App mobile para acesso remoto
- **Configuração**: Precisa habilitar no NVR

## ⚠️ Diferença Importante

### NVR/DVR Hikvision ≠ HikCentral

| Característica | NVR/DVR | HikCentral |
|---|---|---|
| **Tipo** | Hardware (gravador) | Software de gestão |
| **Função** | Gravar câmeras | Gerenciar múltiplos NVRs |
| **API** | ISAPI | RESTful API |
| **Porta Web** | 80 | 8080/443 |
| **SDK Port** | 8000 | Varia |
| **Instalação** | Já instalado (192.168.1.20) | Precisa instalar |

## 🚀 Próximos Passos

1. **Acesse o NVR**: http://192.168.1.20
2. **Faça login** com admin/senha
3. **Verifique em**:
   - Configuração → Rede → Configurações Avançadas → Integração
   - Configuração → Sistema → Segurança → Serviço Web
4. **Habilite ISAPI** se não estiver ativo
5. **Teste a API** com os comandos curl acima

## 📞 Suporte

- **Hikvision Brasil**: +55 11 3090-1120
- **ISAPI Docs**: https://www.hikvision.com/en/support/resources/
- **Community**: https://community.hikvision.com/

---

📅 Atualizado: 19/08/2025
🎯 Sistema: Mega Feira - Integração Biométrica