# API de Exportação - Mega Feira Facial Recognition System

## 🚀 Visão Geral

Esta API foi desenvolvida especificamente para a **importação futura** de dados de participantes e suas imagens faciais por sistemas externos, com foco especial na integração com o sistema **Ultrathink**.

## 📍 Endpoints Principais

### 1. Listar Participantes com Imagens

```http
GET /api/export/participants
```

**Parâmetros de Query:**
- `format`: `'standard'` | `'ultrathink'` | `'hikcenter'` (default: `'standard'`)
- `include_images`: `'true'` | `'false'` (default: `'true'`)
- `event`: Filtrar por evento (`'expointer'` | `'freio-de-ouro'` | `'morfologia'`)
- `date_from`: Filtrar por data de cadastro (ISO 8601)
- `date_to`: Filtrar por data de cadastro (ISO 8601)
- `page`: Página (default: `1`)
- `limit`: Limite por página (default: `50`)

**Exemplos:**

```bash
# Formato padrão com imagens
curl "http://localhost:3002/api/export/participants"

# Formato Ultrathink (específico para integração)
curl "http://localhost:3002/api/export/participants?format=ultrathink"

# Sem imagens (apenas dados)
curl "http://localhost:3002/api/export/participants?include_images=false"

# Filtrar por evento específico
curl "http://localhost:3002/api/export/participants?event=expointer"

# Paginação
curl "http://localhost:3002/api/export/participants?page=1&limit=10"
```

### 2. Imagem Individual de Participante

```http
GET /api/export/participants/[id]/image
```

**Parâmetros de Query:**
- `format`: `'base64'` | `'binary'` | `'metadata'` (default: `'base64'`)
- `download`: `'true'` | `'false'` (default: `'false'`)

**Exemplos:**

```bash
# Obter imagem em base64 com metadados
curl "http://localhost:3002/api/export/participants/1/image"

# Download da imagem original
curl "http://localhost:3002/api/export/participants/1/image?format=binary&download=true" -o participant_1.jpg

# Apenas metadados da imagem
curl "http://localhost:3002/api/export/participants/1/image?format=metadata"
```

## 🔧 Formatos de Resposta

### Formato Standard
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "João Silva",
      "cpf": "123.456.789-00",
      "email": "joao@email.com",
      "phone": "(11) 99999-1234",
      "event": "expointer",
      "mesa": "01",
      "registered_at": "2025-08-14T10:30:00Z",
      "has_face_image": true,
      "face_image": {
        "data": "data:image/jpeg;base64,/9j/4AAQ...",
        "metadata": {
          "width": 640,
          "height": 480,
          "format": "jpeg",
          "quality": 0.9,
          "fileSize": 45672,
          "capturedAt": "2025-08-14T10:30:00Z"
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Formato Ultrathink (Otimizado para Integração)
```json
{
  "system": "mega-feira",
  "version": "1.0.0",
  "export_type": "ultrathink",
  "participants": [
    {
      "external_id": "1",
      "full_name": "João Silva",
      "document": "123.456.789-00",
      "email": "joao@email.com",
      "phone": "(11) 99999-1234",
      "event_code": "expointer",
      "table_number": "01",
      "registration_timestamp": "2025-08-14T10:30:00Z",
      "biometric_data": {
        "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
        "image_format": "jpeg",
        "image_quality": 0.9,
        "dimensions": {
          "width": 640,
          "height": 480
        },
        "captured_at": "2025-08-14T10:30:00Z",
        "file_size_bytes": 45672
      }
    }
  ]
}
```

### Formato HikCenter (Sistema de Controle de Acesso)
```json
{
  "system_name": "MegaFeira",
  "batch_id": "BATCH_1728901234567",
  "personnel": [
    {
      "employeeNo": "1",
      "name": "João Silva",
      "userType": "normal",
      "Valid": {
        "enable": true,
        "beginTime": "2025-08-14T10:30:00Z",
        "endTime": "2025-12-31T23:59:59Z"
      },
      "doorRight": "1",
      "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }],
      "faceData": {
        "faceLibType": "blackFD",
        "libMatching": {
          "libID": "1",
          "FDID": "1",
          "FPID": "1"
        },
        "face": {
          "binaryData": "/9j/4AAQSkZJRgABA..."
        }
      }
    }
  ]
}
```

## 🎯 Estrutura de Dados da Imagem

Cada imagem armazenada contém:

### Dados da Imagem
- **data**: String base64 completa (`data:image/jpeg;base64,...`)
- **metadata**: Objeto com informações técnicas

### Metadados
```json
{
  "width": 640,           // Largura em pixels
  "height": 480,          // Altura em pixels  
  "format": "jpeg",       // Formato (jpeg, png, webp)
  "quality": 0.9,         // Qualidade (0.0 - 1.0)
  "fileSize": 45672,      // Tamanho em bytes
  "capturedAt": "2025-08-14T10:30:00Z"  // Timestamp da captura
}
```

## 🔐 Autenticação e Segurança

### Headers CORS
A API está configurada para permitir acesso de qualquer origem durante o desenvolvimento:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
```

### Autenticação (Produção)
Para ambiente de produção, implemente:

```javascript
// Header de autenticação
headers: {
  'Authorization': 'Bearer your-api-token',
  'X-API-Key': 'your-api-key'
}
```

## 📊 Casos de Uso para Integração

### 1. Sistema Ultrathink
```bash
# Exportar todos os participantes para Ultrathink
curl -X GET "https://megafeira.com/api/export/participants?format=ultrathink" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Controle de Acesso HikCenter
```bash
# Exportar para sistema de controle de acesso
curl -X GET "https://megafeira.com/api/export/participants?format=hikcenter&event=expointer" \
  -H "X-API-Key: HIKCENTER_KEY"
```

### 3. Backup de Imagens
```bash
# Download em massa das imagens
for id in 1 2 3; do
  curl "https://megafeira.com/api/export/participants/$id/image?format=binary&download=true" \
    -o "backup/participant_$id.jpg"
done
```

## 🚀 Exemplo de Integração em Python

```python
import requests
import base64
import json

class MegaFeiraExporter:
    def __init__(self, base_url, api_key=None):
        self.base_url = base_url
        self.headers = {
            'Content-Type': 'application/json'
        }
        if api_key:
            self.headers['X-API-Key'] = api_key
    
    def get_participants_for_ultrathink(self, event=None):
        """Exportar participantes no formato Ultrathink"""
        params = {
            'format': 'ultrathink',
            'include_images': 'true'
        }
        if event:
            params['event'] = event
        
        response = requests.get(
            f"{self.base_url}/api/export/participants",
            params=params,
            headers=self.headers
        )
        return response.json()
    
    def download_participant_image(self, participant_id, save_path):
        """Download de imagem individual"""
        response = requests.get(
            f"{self.base_url}/api/export/participants/{participant_id}/image",
            params={'format': 'binary', 'download': 'true'},
            headers=self.headers
        )
        
        with open(save_path, 'wb') as f:
            f.write(response.content)
        
        return True
    
    def sync_to_external_system(self):
        """Sincronizar dados com sistema externo"""
        data = self.get_participants_for_ultrathink()
        
        # Processar cada participante
        for participant in data['participants']:
            # Extrair imagem base64
            if participant['biometric_data']:
                image_data = participant['biometric_data']['image_base64']
                # Processar e enviar para sistema externo
                self.send_to_external_api(participant)
    
    def send_to_external_api(self, participant_data):
        """Enviar dados para API externa"""
        # Implementar lógica específica do sistema externo
        pass

# Uso
exporter = MegaFeiraExporter('http://localhost:3002', 'your-api-key')
participants = exporter.get_participants_for_ultrathink('expointer')
print(f"Exportados {len(participants['participants'])} participantes")
```

## 📈 Performance e Limites

### Paginação
- **Limite máximo por página**: 100 registros
- **Limite recomendado**: 50 registros
- **Timeout**: 30 segundos por requisição

### Cache e Otimização
- Images são servidas com cache headers apropriados
- Compressão gzip habilitada
- Formato base64 otimizado para transferência

### Rate Limiting (Produção)
```
- 100 requests por minuto por IP
- 1000 requests por hora por API key
- 10000 requests por dia por cliente
```

## 🔧 Monitoramento

### Logs de Exportação
```
📊 Export request: format=ultrathink, participants=25, page=1
🖼️ Image export: participant=1, format=binary
```

### Métricas Recomendadas
- Taxa de sucesso das exportações
- Tempo médio de resposta
- Volume de dados transferidos
- Erros por formato de exportação

## 🛠️ Desenvolvimento Local

Para testar a API localmente:

```bash
# Iniciar o servidor
npm run dev

# Testar endpoints
curl "http://localhost:3002/api/export/participants"
curl "http://localhost:3002/api/export/participants/1/image"
```

## 🎯 Próximos Passos

1. **Implementar autenticação JWT** para produção
2. **Adicionar rate limiting** com Redis
3. **Configurar CDN** para servir imagens
4. **Implementar webhooks** para notificar sistemas externos
5. **Adicionar compressão de imagem** automática
6. **Criar dashboard** de monitoramento de exportações

---

**Observação**: Esta API foi desenvolvida especificamente pensando na **importação futura** por sistemas externos como o Ultrathink, garantindo que os dados estejam sempre disponíveis em formatos padronizados e otimizados para integração.