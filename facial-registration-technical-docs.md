# Documentação Técnica Completa - Sistema de Cadastro Facial

## 📚 Índice da Documentação

1. [Setup e Instalação](#1-setup-e-instalação)
2. [Arquitetura e Estrutura](#2-arquitetura-e-estrutura)
3. [Guia de Desenvolvimento](#3-guia-de-desenvolvimento)
4. [API Reference](#4-api-reference)
5. [Integração HikCenter](#5-integração-hikcenter)
6. [Segurança e LGPD](#6-segurança-e-lgpd)
7. [Configuração](#7-configuração)
8. [Deploy e DevOps](#8-deploy-e-devops)
9. [Troubleshooting](#9-troubleshooting)
10. [Runbook Operacional](#10-runbook-operacional)

---

## 1. SETUP E INSTALAÇÃO

### 1.1 Requisitos do Sistema

```yaml
Minimum Requirements:
  Development:
    - Node.js: 20.x LTS
    - npm: 10.x
    - PostgreSQL: 15+
    - Redis: 7.2+
    - Docker: 24+
    - RAM: 8GB
    - Storage: 20GB

  Production:
    - Server: Ubuntu 22.04 LTS / RHEL 9
    - CPU: 8 cores
    - RAM: 32GB
    - Storage: 500GB SSD
    - Network: 100Mbps+
```

### 1.2 Instalação Passo a Passo

```bash
#!/bin/bash
# setup.sh - Script de instalação completo

# 1. Clone o repositório
git clone https://github.com/empresa/facial-registration.git
cd facial-registration

# 2. Instale as ferramentas necessárias
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-15 redis-server nginx

# 3. Configure o PostgreSQL
sudo -u postgres psql <<EOF
CREATE USER facial_user WITH PASSWORD 'secure_password';
CREATE DATABASE facial_events OWNER facial_user;
GRANT ALL PRIVILEGES ON DATABASE facial_events TO facial_user;
EOF

# 4. Configure o Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 5. Instale as dependências do projeto
npm run install:all

# 6. Configure as variáveis de ambiente
cp .env.example .env
echo "Por favor, edite o arquivo .env com suas configurações"

# 7. Execute as migrations
npm run db:setup

# 8. Build da aplicação
npm run build

# 9. Inicie os serviços
npm run start:all
```

### 1.3 Estrutura de Diretórios

```
facial-registration/
├── frontend/                 # Aplicação React
│   ├── src/
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── pages/          # Páginas da aplicação
│   │   ├── services/       # Serviços e API calls
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Funções utilitárias
│   │   ├── styles/         # Estilos globais
│   │   └── types/          # TypeScript types
│   ├── public/             # Assets públicos
│   └── package.json
│
├── backend/                 # API Node.js
│   ├── src/
│   │   ├── controllers/    # Controllers
│   │   ├── services/       # Business logic
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Express middleware
│   │   ├── utils/          # Utilities
│   │   ├── config/         # Configurações
│   │   └── types/          # TypeScript types
│   ├── prisma/             # Prisma schemas
│   └── package.json
│
├── database/               # Database files
│   ├── migrations/        # SQL migrations
│   ├── seeds/            # Seed data
│   └── backups/          # Backup scripts
│
├── docker/                # Docker configurations
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── docker-compose.yml
│
├── scripts/              # Utility scripts
│   ├── setup.sh         # Setup script
│   ├── deploy.sh        # Deploy script
│   └── backup.sh        # Backup script
│
├── docs/                 # Documentação
├── tests/               # Testes
└── .github/             # GitHub Actions
```

---

## 2. ARQUITETURA E ESTRUTURA

### 2.1 Arquitetura de Microsserviços

```yaml
Services:
  Frontend Service:
    - Port: 3000
    - Technology: React + Vite
    - Responsibility: UI/UX, Face capture
    
  API Gateway:
    - Port: 4000
    - Technology: Express + Node.js
    - Responsibility: Request routing, Auth
    
  Face Processing Service:
    - Port: 4001
    - Technology: Node.js + MediaPipe
    - Responsibility: Face validation, Template extraction
    
  Storage Service:
    - Port: 4002
    - Technology: MinIO
    - Responsibility: Image storage, CDN
    
  Sync Service:
    - Port: 4003
    - Technology: Node.js + Bull
    - Responsibility: HikCenter sync, Batch processing
    
  Database:
    - Port: 5432
    - Technology: PostgreSQL
    - Responsibility: Data persistence
    
  Cache:
    - Port: 6379
    - Technology: Redis
    - Responsibility: Session, Queue, Cache
```

### 2.2 Modelo de Dados

```sql
-- Database Schema

-- Tabela de participantes
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(11) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    event_code VARCHAR(50),
    additional_codes TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de dados biométricos
CREATE TABLE biometric_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    face_template BYTEA NOT NULL, -- Encrypted template
    face_image_url VARCHAR(500),
    quality_score DECIMAL(3,2),
    capture_device VARCHAR(255),
    capture_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de consentimento LGPD
CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
    accepted BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    consent_text TEXT,
    accepted_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP
);

-- Tabela de sincronização com HikCenter
CREATE TABLE hikcenter_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id),
    hikcenter_id VARCHAR(100),
    sync_status VARCHAR(20) DEFAULT 'pending',
    sync_attempts INTEGER DEFAULT 0,
    last_sync_attempt TIMESTAMP,
    sync_completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de logs de auditoria
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_participants_cpf ON participants(cpf);
CREATE INDEX idx_participants_event ON participants(event_code);
CREATE INDEX idx_biometric_participant ON biometric_data(participant_id);
CREATE INDEX idx_sync_status ON hikcenter_sync(sync_status);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

### 2.3 Fluxo de Dados Detalhado

```mermaid
sequenceDiagram
    participant U as Usuário
    participant F as Frontend
    participant A as API Gateway
    participant FP as Face Processor
    participant DB as Database
    participant S as Storage
    participant H as HikCenter
    
    U->>F: Acessa página de cadastro
    F->>U: Solicita permissão câmera
    U->>F: Permite acesso
    F->>F: Inicia captura com MediaPipe
    U->>F: Captura face
    F->>F: Valida qualidade local
    F->>A: POST /api/registration
    A->>FP: Processa imagem
    FP->>S: Salva imagem
    FP->>DB: Salva template
    A->>DB: Salva dados pessoais
    A->>F: Retorna sucesso
    A->>H: Sync assíncrono
    H->>DB: Atualiza status
```

---

## 3. GUIA DE DESENVOLVIMENTO

### 3.1 Setup do Ambiente de Desenvolvimento

```bash
# Clone e setup inicial
git clone <repository>
cd facial-registration

# Instale as dependências
npm install

# Configure o ambiente
cp .env.example .env.local

# Inicie os containers de desenvolvimento
docker-compose -f docker/docker-compose.dev.yml up -d

# Inicie o frontend (terminal 1)
cd frontend
npm run dev

# Inicie o backend (terminal 2)
cd backend
npm run dev

# Acesse
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
# MinIO: http://localhost:9001
```

### 3.2 Componentes React Principais

```typescript
// components/FaceCapture.tsx
import React, { useRef, useState, useEffect } from 'react';
import { FaceDetection } from '@mediapipe/face_detection';
import { Camera } from '@mediapipe/camera_utils';

interface FaceCaptureProps {
  onCapture: (imageData: string) => void;
  onError: (error: Error) => void;
}

export const FaceCapture: React.FC<FaceCaptureProps> = ({ 
  onCapture, 
  onError 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceDetector, setFaceDetector] = useState<FaceDetection | null>(null);

  useEffect(() => {
    const initializeDetector = async () => {
      try {
        // Inicializar MediaPipe
        const faceDetection = new FaceDetection({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
          },
        });

        faceDetection.setOptions({
          modelSelection: 0, // 0 for short-range, 1 for full-range
          minDetectionConfidence: 0.5,
        });

        faceDetection.onResults(onResults);
        setFaceDetector(faceDetection);

        // Inicializar câmera
        if (videoRef.current) {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (faceDetection && videoRef.current) {
                await faceDetection.send({ image: videoRef.current });
              }
            },
            width: 1280,
            height: 720,
            facingMode: 'user'
          });
          await camera.start();
        }
      } catch (error) {
        onError(error as Error);
      }
    };

    initializeDetector();

    return () => {
      // Cleanup
      if (faceDetector) {
        faceDetector.close();
      }
    };
  }, []);

  const onResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    // Limpar canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Desenhar vídeo
    canvasCtx.drawImage(
      videoRef.current,
      0, 0,
      canvasRef.current.width,
      canvasRef.current.height
    );

    // Desenhar detecções
    if (results.detections && results.detections.length > 0) {
      setIsDetecting(true);
      
      for (const detection of results.detections) {
        const box = detection.boundingBox;
        
        // Desenhar caixa ao redor da face
        canvasCtx.strokeStyle = '#00FF00';
        canvasCtx.lineWidth = 3;
        canvasCtx.strokeRect(
          box.xCenter - box.width / 2,
          box.yCenter - box.height / 2,
          box.width,
          box.height
        );

        // Validar qualidade
        if (validateFacePosition(box)) {
          canvasCtx.strokeStyle = '#00FF00';
          // Face em posição ideal
        } else {
          canvasCtx.strokeStyle = '#FFFF00';
          // Face precisa ajuste
        }
      }
    } else {
      setIsDetecting(false);
    }

    canvasCtx.restore();
  };

  const validateFacePosition = (box: any): boolean => {
    // Validar se a face está centralizada e com tamanho adequado
    const centerX = box.xCenter;
    const centerY = box.yCenter;
    const width = box.width;
    const height = box.height;

    const isCentered = 
      Math.abs(centerX - 0.5) < 0.1 && 
      Math.abs(centerY - 0.5) < 0.1;
    
    const isCorrectSize = 
      width > 0.2 && width < 0.5 &&
      height > 0.2 && height < 0.5;

    return isCentered && isCorrectSize;
  };

  const captureImage = () => {
    if (!canvasRef.current) return;
    
    const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9);
    onCapture(imageData);
  };

  return (
    <div className="face-capture-container">
      <div className="camera-view">
        <video 
          ref={videoRef}
          className="hidden"
          playsInline
        />
        <canvas 
          ref={canvasRef}
          width={1280}
          height={720}
          className="capture-canvas"
        />
        
        <div className="capture-overlay">
          <div className="face-guide-circle" />
          <p className="capture-instructions">
            {isDetecting 
              ? "Face detectada! Posicione-se no centro"
              : "Procurando por face..."}
          </p>
        </div>
      </div>

      <button 
        onClick={captureImage}
        disabled={!isDetecting}
        className="capture-button"
      >
        Capturar Foto
      </button>
    </div>
  );
};
```

### 3.3 API Backend Implementation

```typescript
// backend/src/controllers/registration.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { uploadToS3 } from '../services/storage.service';
import { extractFaceTemplate } from '../services/face.service';
import { encryptData } from '../utils/encryption';
import { validateCPF } from '../utils/validators';
import { addToSyncQueue } from '../services/queue.service';
import { createAuditLog } from '../services/audit.service';

const prisma = new PrismaClient();

export class RegistrationController {
  async createRegistration(req: Request, res: Response) {
    try {
      // Validar dados de entrada
      const { 
        name, 
        cpf, 
        email, 
        phone,
        eventCode,
        additionalCodes,
        faceImage,
        consent 
      } = req.body;

      // Validações
      if (!validateCPF(cpf)) {
        return res.status(400).json({ 
          error: 'CPF inválido' 
        });
      }

      if (!consent?.accepted) {
        return res.status(400).json({ 
          error: 'Consentimento é obrigatório' 
        });
      }

      // Verificar duplicidade
      const existingParticipant = await prisma.participants.findUnique({
        where: { cpf }
      });

      if (existingParticipant) {
        return res.status(409).json({ 
          error: 'Participante já cadastrado' 
        });
      }

      // Processar imagem facial
      const imageBuffer = Buffer.from(
        faceImage.replace(/^data:image\/\w+;base64,/, ''), 
        'base64'
      );

      // Extrair template biométrico
      const faceTemplate = await extractFaceTemplate(imageBuffer);
      
      if (!faceTemplate) {
        return res.status(400).json({ 
          error: 'Não foi possível processar a face' 
        });
      }

      // Upload da imagem para S3/MinIO
      const imageUrl = await uploadToS3(
        imageBuffer, 
        `faces/${cpf}-${Date.now()}.jpg`
      );

      // Criptografar template
      const encryptedTemplate = await encryptData(
        Buffer.from(faceTemplate)
      );

      // Iniciar transação
      const result = await prisma.$transaction(async (tx) => {
        // Criar participante
        const participant = await tx.participants.create({
          data: {
            name,
            cpf,
            email,
            phone,
            eventCode,
            additionalCodes
          }
        });

        // Salvar dados biométricos
        const biometric = await tx.biometricData.create({
          data: {
            participantId: participant.id,
            faceTemplate: encryptedTemplate,
            faceImageUrl: imageUrl,
            qualityScore: faceTemplate.qualityScore,
            captureDevice: req.headers['user-agent'],
            captureTimestamp: new Date()
          }
        });

        // Registrar consentimento
        const consentRecord = await tx.consentRecords.create({
          data: {
            participantId: participant.id,
            consentType: 'BIOMETRIC_DATA',
            accepted: true,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            consentText: consent.text,
            acceptedAt: new Date()
          }
        });

        // Criar registro de sincronização
        const syncRecord = await tx.hikCenterSync.create({
          data: {
            participantId: participant.id,
            syncStatus: 'pending'
          }
        });

        return { 
          participant, 
          biometric, 
          consentRecord, 
          syncRecord 
        };
      });

      // Adicionar à fila de sincronização
      await addToSyncQueue({
        participantId: result.participant.id,
        priority: 'normal'
      });

      // Log de auditoria
      await createAuditLog({
        userId: 'system',
        action: 'PARTICIPANT_CREATED',
        entityType: 'participant',
        entityId: result.participant.id,
        newValues: result.participant,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Responder com sucesso
      res.status(201).json({
        success: true,
        registrationId: result.participant.id,
        message: 'Cadastro realizado com sucesso',
        qrCode: generateQRCode(result.participant.id),
        hikCenterStatus: 'pending'
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      res.status(500).json({
        error: 'Erro ao processar cadastro',
        message: process.env.NODE_ENV === 'development' 
          ? error.message 
          : 'Erro interno do servidor'
      });
    }
  }

  async getRegistration(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const participant = await prisma.participants.findUnique({
        where: { id },
        include: {
          biometricData: true,
          hikCenterSync: true
        }
      });

      if (!participant) {
        return res.status(404).json({ 
          error: 'Participante não encontrado' 
        });
      }

      // Log de auditoria
      await createAuditLog({
        userId: req.user?.id || 'anonymous',
        action: 'PARTICIPANT_VIEWED',
        entityType: 'participant',
        entityId: participant.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        participant: {
          id: participant.id,
          name: participant.name,
          cpf: participant.cpf.replace(/(\d{3})(\d{3})(\d{3})/, '$1.***.$3-**'),
          eventCode: participant.eventCode,
          createdAt: participant.createdAt,
          syncStatus: participant.hikCenterSync?.[0]?.syncStatus
        }
      });

    } catch (error) {
      console.error('Get registration error:', error);
      res.status(500).json({ 
        error: 'Erro ao buscar cadastro' 
      });
    }
  }

  async deleteRegistration(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Buscar participante
      const participant = await prisma.participants.findUnique({
        where: { id },
        include: { biometricData: true }
      });

      if (!participant) {
        return res.status(404).json({ 
          error: 'Participante não encontrado' 
        });
      }

      // Deletar imagem do S3
      if (participant.biometricData?.[0]?.faceImageUrl) {
        await deleteFromS3(participant.biometricData[0].faceImageUrl);
      }

      // Deletar registros (cascade delete configurado)
      await prisma.participants.delete({
        where: { id }
      });

      // Log de auditoria
      await createAuditLog({
        userId: req.user?.id || 'system',
        action: 'PARTICIPANT_DELETED',
        entityType: 'participant',
        entityId: id,
        oldValues: participant,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        additionalData: { reason }
      });

      res.json({
        success: true,
        message: 'Cadastro excluído com sucesso'
      });

    } catch (error) {
      console.error('Delete registration error:', error);
      res.status(500).json({ 
        error: 'Erro ao excluir cadastro' 
      });
    }
  }
}

// Função auxiliar para gerar QR Code
function generateQRCode(participantId: string): string {
  // Implementar geração de QR Code
  return `QR_${participantId}`;
}
```

---

## 4. API REFERENCE

### 4.1 Endpoints Principais

```yaml
Base URL: https://api.evento.com/v1

Authentication:
  - Public endpoints: No auth required
  - Admin endpoints: Bearer token required
  - System endpoints: API Key required
```

### 4.2 Documentação Completa dos Endpoints

#### POST /api/v1/registration
**Criar novo cadastro de participante**

```typescript
// Request
POST /api/v1/registration
Content-Type: application/json

{
  "personalData": {
    "name": "João Silva",
    "cpf": "12345678901",
    "email": "joao@email.com",
    "phone": "+5551999999999",
    "eventCode": "EVT2025",
    "additionalCodes": ["VIP", "SPEAKER"]
  },
  "biometricData": {
    "faceImage": "data:image/jpeg;base64,/9j/4AAQ...",
    "captureMetadata": {
      "timestamp": "2025-08-08T10:30:00Z",
      "device": "iPhone 14",
      "quality": 0.95
    }
  },
  "consent": {
    "accepted": true,
    "text": "Concordo com os termos...",
    "timestamp": "2025-08-08T10:30:00Z"
  }
}

// Response 201 Created
{
  "success": true,
  "registrationId": "550e8400-e29b-41d4-a716-446655440000",
  "qrCode": "data:image/png;base64,iVBORw0KG...",
  "message": "Cadastro realizado com sucesso",
  "hikCenterStatus": "pending"
}

// Response 400 Bad Request
{
  "error": "Validation failed",
  "details": {
    "cpf": "CPF inválido",
    "faceImage": "Qualidade insuficiente"
  }
}
```

#### GET /api/v1/registration/{id}
**Consultar cadastro específico**

```typescript
// Request
GET /api/v1/registration/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>

// Response 200 OK
{
  "participant": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "João Silva",
    "cpf": "123.***.789-**",
    "eventCode": "EVT2025",
    "createdAt": "2025-08-08T10:30:00Z",
    "syncStatus": "synced",
    "hikCenterId": "HC-12345"
  }
}
```

#### DELETE /api/v1/registration/{id}
**Excluir cadastro (LGPD)**

```typescript
// Request
DELETE /api/v1/registration/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Solicitação do titular",
  "confirmedBy": "admin@evento.com"
}

// Response 200 OK
{
  "success": true,
  "message": "Cadastro excluído permanentemente",
  "deletedAt": "2025-08-08T11:00:00Z"
}
```

#### POST /api/v1/hikcenter/sync
**Sincronizar com HikCenter**

```typescript
// Request
POST /api/v1/hikcenter/sync
Authorization: ApiKey <api-key>
Content-Type: application/json

{
  "participantIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ],
  "priority": "high"
}

// Response 202 Accepted
{
  "jobId": "sync-job-12345",
  "status": "queued",
  "estimatedTime": 30,
  "message": "Sincronização iniciada"
}
```

#### GET /api/v1/hikcenter/status/{participantId}
**Verificar status de sincronização**

```typescript
// Request
GET /api/v1/hikcenter/status/550e8400-e29b-41d4-a716-446655440000

// Response 200 OK
{
  "participantId": "550e8400-e29b-41d4-a716-446655440000",
  "hikCenterId": "HC-12345",
  "syncStatus": "synced",
  "lastSync": "2025-08-08T10:35:00Z",
  "attempts": 1,
  "terminal": "Terminal-01"
}
```

#### POST /api/v1/face/validate
**Validar qualidade da imagem facial**

```typescript
// Request
POST /api/v1/face/validate
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "requirements": {
    "minQuality": 0.8,
    "detectLiveness": true
  }
}

// Response 200 OK
{
  "valid": true,
  "quality": 0.92,
  "details": {
    "faceDetected": true,
    "faceCount": 1,
    "lighting": "good",
    "sharpness": "excellent",
    "eyesOpen": true,
    "faceCentered": true,
    "liveness": "passed"
  }
}
```

### 4.3 Códigos de Status HTTP

```yaml
Success:
  200: OK - Requisição bem-sucedida
  201: Created - Recurso criado
  202: Accepted - Processamento assíncrono iniciado
  204: No Content - Sucesso sem conteúdo

Client Errors:
  400: Bad Request - Dados inválidos
  401: Unauthorized - Não autenticado
  403: Forbidden - Sem permissão
  404: Not Found - Recurso não encontrado
  409: Conflict - Conflito (ex: duplicado)
  422: Unprocessable Entity - Validação falhou
  429: Too Many Requests - Rate limit excedido

Server Errors:
  500: Internal Server Error - Erro do servidor
  502: Bad Gateway - Erro de proxy
  503: Service Unavailable - Serviço indisponível
  504: Gateway Timeout - Timeout
```

---

## 5. INTEGRAÇÃO HIKCENTER

### 5.1 Configuração da Integração

```typescript
// config/hikcenter.config.ts
export const hikCenterConfig = {
  baseUrl: process.env.HIKCENTER_URL || 'https://hikcenter.local',
  apiVersion: '/api/acs/v1',
  auth: {
    type: 'digest', // or 'apikey'
    username: process.env.HIKCENTER_USER,
    password: process.env.HIKCENTER_PASS,
    apiKey: process.env.HIKCENTER_API_KEY,
    apiSecret: process.env.HIKCENTER_API_SECRET
  },
  endpoints: {
    personBatch: '/person/batch',
    faceUpload: '/face/upload',
    cardAssign: '/card/assign',
    accessLevel: '/accessLevel/assign',
    eventSubscribe: '/event/subscribe'
  },
  limits: {
    batchSize: 100,
    maxRetries: 3,
    retryDelay: 5000,
    requestTimeout: 30000,
    rateLimit: 10 // requests per second
  },
  faceLibrary: {
    libraryId: '1',
    libraryType: 'blackFD'
  }
};
```

### 5.2 Serviço de Integração

```typescript
// services/hikcenter.service.ts
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { hikCenterConfig } from '../config/hikcenter.config';
import { logger } from '../utils/logger';
import pLimit from 'p-limit';

export class HikCenterService {
  private client: AxiosInstance;
  private limit = pLimit(hikCenterConfig.limits.rateLimit);

  constructor() {
    this.client = axios.create({
      baseURL: hikCenterConfig.baseUrl + hikCenterConfig.apiVersion,
      timeout: hikCenterConfig.limits.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Adicionar interceptor para autenticação
    this.client.interceptors.request.use(
      (config) => this.addAuthentication(config),
      (error) => Promise.reject(error)
    );

    // Adicionar interceptor para retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => this.handleError(error)
    );
  }

  private addAuthentication(config: any) {
    if (hikCenterConfig.auth.type === 'digest') {
      // Implementar Digest Auth
      const ha1 = crypto.createHash('md5')
        .update(`${hikCenterConfig.auth.username}:HikCentral:${hikCenterConfig.auth.password}`)
        .digest('hex');
      
      const ha2 = crypto.createHash('md5')
        .update(`${config.method.toUpperCase()}:${config.url}`)
        .digest('hex');
      
      const nonce = crypto.randomBytes(16).toString('hex');
      const response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${ha2}`)
        .digest('hex');
      
      config.headers['Authorization'] = `Digest username="${hikCenterConfig.auth.username}", nonce="${nonce}", response="${response}"`;
    } else {
      // API Key auth
      const timestamp = Date.now().toString();
      const signature = this.generateSignature(
        config.method,
        config.url,
        timestamp
      );
      
      config.headers['X-API-Key'] = hikCenterConfig.auth.apiKey;
      config.headers['X-Timestamp'] = timestamp;
      config.headers['X-Signature'] = signature;
    }
    
    return config;
  }

  private generateSignature(method: string, url: string, timestamp: string): string {
    const message = `${method.toUpperCase()}\n${url}\n${timestamp}`;
    return crypto
      .createHmac('sha256', hikCenterConfig.auth.apiSecret!)
      .update(message)
      .digest('base64');
  }

  private async handleError(error: any) {
    const config = error.config;
    
    if (!config || !config.retryCount) {
      config.retryCount = 0;
    }
    
    if (config.retryCount < hikCenterConfig.limits.maxRetries) {
      config.retryCount++;
      
      logger.warn(`Retry attempt ${config.retryCount} for ${config.url}`);
      
      // Exponential backoff
      const delay = hikCenterConfig.limits.retryDelay * Math.pow(2, config.retryCount - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.client(config);
    }
    
    logger.error('Max retries exceeded', error);
    return Promise.reject(error);
  }

  async uploadPersonBatch(persons: any[]): Promise<any> {
    const batches = this.createBatches(persons, hikCenterConfig.limits.batchSize);
    const results = [];

    for (const batch of batches) {
      const result = await this.limit(() => this.uploadBatch(batch));
      results.push(result);
    }

    return results;
  }

  private async uploadBatch(batch: any[]): Promise<any> {
    try {
      const payload = {
        faceLibType: hikCenterConfig.faceLibrary.libraryType,
        FDID: hikCenterConfig.faceLibrary.libraryId,
        employeeList: batch.map(person => ({
          employeeNo: person.id,
          employeeName: person.name,
          faceURL: person.faceTemplate,
          cardNo: person.cpf.replace(/\D/g, ''),
          registerTime: new Date().toISOString(),
          validStartTime: new Date().toISOString(),
          validEndTime: this.getEventEndDate(),
          accessLevelIds: ['1'], // Default access level
          customData: {
            eventCode: person.eventCode,
            additionalCodes: person.additionalCodes
          }
        }))
      };

      const response = await this.client.post(
        hikCenterConfig.endpoints.personBatch,
        payload
      );

      logger.info(`Batch uploaded successfully: ${batch.length} persons`);
      return response.data;

    } catch (error) {
      logger.error('Batch upload failed:', error);
      throw error;
    }
  }

  async subscribeToEvents(callbackUrl: string): Promise<void> {
    try {
      const payload = {
        eventTypes: [
          'AccessControllerEvent',
          'FaceRecognitionEvent',
          'AlarmEvent'
        ],
        callbackUrl,
        callbackMethod: 'POST'
      };

      await this.client.post(
        hikCenterConfig.endpoints.eventSubscribe,
        payload
      );

      logger.info('Event subscription successful');
    } catch (error) {
      logger.error('Event subscription failed:', error);
      throw error;
    }
  }

  async getPersonStatus(personId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/person/${personId}/status`
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to get person status: ${personId}`, error);
      throw error;
    }
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private getEventEndDate(): string {
    // Adicionar 90 dias a partir de hoje
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90);
    return endDate.toISOString();
  }
}

// Webhook handler para eventos do HikCenter
export async function handleHikCenterWebhook(req: Request, res: Response) {
  try {
    const { eventType, eventData } = req.body;

    logger.info(`HikCenter event received: ${eventType}`);

    switch (eventType) {
      case 'FaceRecognitionEvent':
        await handleFaceRecognition(eventData);
        break;
      case 'AccessControllerEvent':
        await handleAccessEvent(eventData);
        break;
      case 'AlarmEvent':
        await handleAlarmEvent(eventData);
        break;
      default:
        logger.warn(`Unknown event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook handling failed:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
}

async function handleFaceRecognition(eventData: any) {
  // Processar evento de reconhecimento facial
  const { personId, terminalId, timestamp, confidence } = eventData;
  
  // Registrar no banco
  await prisma.accessLogs.create({
    data: {
      participantId: personId,
      terminalId,
      eventType: 'FACE_RECOGNITION',
      confidence,
      timestamp: new Date(timestamp)
    }
  });
}

async function handleAccessEvent(eventData: any) {
  // Processar evento de acesso
  logger.info('Access event:', eventData);
}

async function handleAlarmEvent(eventData: any) {
  // Processar alarme
  logger.warn('Alarm event:', eventData);
  
  // Notificar administradores
  await sendAlarmNotification(eventData);
}
```

---

## 6. SEGURANÇA E LGPD

### 6.1 Implementação de Criptografia

```typescript
// utils/encryption.ts
import crypto from 'crypto';
import { promisify } from 'util';

const algorithm = 'aes-256-gcm';
const saltLength = 64;
const tagLength = 16;
const pbkdf2Iterations = 100000;

export class EncryptionService {
  private masterKey: string;

  constructor() {
    this.masterKey = process.env.MASTER_KEY!;
    if (!this.masterKey || this.masterKey.length < 32) {
      throw new Error('Invalid master key configuration');
    }
  }

  async encrypt(data: Buffer | string): Promise<Buffer> {
    try {
      // Gerar salt aleatório
      const salt = crypto.randomBytes(saltLength);
      
      // Derivar chave do master key
      const key = await this.deriveKey(this.masterKey, salt);
      
      // Gerar IV aleatório
      const iv = crypto.randomBytes(16);
      
      // Criar cipher
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      // Encriptar dados
      const encrypted = Buffer.concat([
        cipher.update(data),
        cipher.final()
      ]);
      
      // Obter tag de autenticação
      const tag = cipher.getAuthTag();
      
      // Combinar tudo: salt + iv + tag + encrypted
      return Buffer.concat([salt, iv, tag, encrypted]);
      
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  async decrypt(encryptedData: Buffer): Promise<Buffer> {
    try {
      // Extrair componentes
      const salt = encryptedData.slice(0, saltLength);
      const iv = encryptedData.slice(saltLength, saltLength + 16);
      const tag = encryptedData.slice(saltLength + 16, saltLength + 16 + tagLength);
      const encrypted = encryptedData.slice(saltLength + 16 + tagLength);
      
      // Derivar chave
      const key = await this.deriveKey(this.masterKey, salt);
      
      // Criar decipher
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      // Decriptar
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted;
      
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    const pbkdf2 = promisify(crypto.pbkdf2);
    return await pbkdf2(password, salt, pbkdf2Iterations, 32, 'sha256');
  }

  // Função para hash de dados sensíveis (para busca)
  hashData(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data + this.masterKey)
      .digest('hex');
  }

  // Função para gerar tokens seguros
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Middleware para descriptografar dados automaticamente
export function decryptMiddleware(fields: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const encryptionService = new EncryptionService();
    
    for (const field of fields) {
      if (req.body[field]) {
        try {
          const encrypted = Buffer.from(req.body[field], 'base64');
          const decrypted = await encryptionService.decrypt(encrypted);
          req.body[field] = decrypted.toString();
        } catch (error) {
          return res.status(400).json({ 
            error: `Invalid encrypted data in field: ${field}` 
          });
        }
      }
    }
    
    next();
  };
}
```

### 6.2 Gerenciamento de Consentimento LGPD

```typescript
// services/consent.service.ts
import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email.service';

const prisma = new PrismaClient();

export class ConsentService {
  async recordConsent(
    participantId: string,
    consentData: any,
    ipAddress: string,
    userAgent: string
  ): Promise<any> {
    // Registrar consentimento
    const consent = await prisma.consentRecords.create({
      data: {
        participantId,
        consentType: 'BIOMETRIC_DATA',
        accepted: true,
        ipAddress,
        userAgent,
        consentText: this.getConsentText(),
        acceptedAt: new Date(),
        metadata: {
          version: '1.0',
          language: 'pt-BR',
          ...consentData
        }
      }
    });

    // Enviar confirmação por email
    await this.sendConsentConfirmation(participantId);

    return consent;
  }

  async revokeConsent(
    participantId: string,
    reason: string
  ): Promise<void> {
    // Marcar consentimento como revogado
    await prisma.consentRecords.updateMany({
      where: {
        participantId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date(),
        metadata: {
          revocationReason: reason
        }
      }
    });

    // Agendar exclusão de dados
    await this.scheduleDataDeletion(participantId);
  }

  async getConsentStatus(participantId: string): Promise<any> {
    const consents = await prisma.consentRecords.findMany({
      where: { participantId },
      orderBy: { acceptedAt: 'desc' }
    });

    return {
      hasActiveConsent: consents.some(c => !c.revokedAt),
      consents: consents.map(c => ({
        type: c.consentType,
        accepted: c.accepted,
        acceptedAt: c.acceptedAt,
        revokedAt: c.revokedAt,
        version: c.metadata?.version
      }))
    };
  }

  private getConsentText(): string {
    return `
TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS E BIOMÉTRICOS

1. CONTROLADOR
${process.env.COMPANY_NAME}
CNPJ: ${process.env.COMPANY_CNPJ}

2. DADOS COLETADOS
- Dados pessoais: nome, CPF, email, telefone
- Dados biométricos: fotografia facial e template biométrico

3. FINALIDADE
Controle de acesso ao evento através de reconhecimento facial

4. COMPARTILHAMENTO
Seus dados serão compartilhados apenas com o sistema HikCenter 
para operacionalização do controle de acesso.

5. PERÍODO DE RETENÇÃO
90 dias após o término do evento

6. SEUS DIREITOS
- Confirmar a existência de tratamento
- Acessar seus dados
- Corrigir dados incompletos ou desatualizados
- Solicitar anonimização ou bloqueio
- Solicitar portabilidade
- Solicitar eliminação
- Revogar consentimento

7. SEGURANÇA
Utilizamos criptografia AES-256 e seguimos as melhores práticas 
de segurança da informação.

8. CONTATO DPO
Email: ${process.env.DPO_EMAIL}
Telefone: ${process.env.DPO_PHONE}

Data: ${new Date().toLocaleDateString('pt-BR')}
    `;
  }

  private async sendConsentConfirmation(participantId: string) {
    const participant = await prisma.participants.findUnique({
      where: { id: participantId }
    });

    if (participant?.email) {
      await sendEmail({
        to: participant.email,
        subject: 'Confirmação de Consentimento - Dados Biométricos',
        template: 'consent-confirmation',
        data: {
          name: participant.name,
          date: new Date().toLocaleDateString('pt-BR')
        }
      });
    }
  }

  private async scheduleDataDeletion(participantId: string) {
    // Agendar job para deletar dados em 7 dias
    await addToQueue('data-deletion', {
      participantId,
      scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }
}
```

### 6.3 Auditoria e Logs

```typescript
// services/audit.service.ts
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

const prisma = new PrismaClient();

// Configurar logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/audit.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    new winston.transports.MongoDB({
      db: process.env.MONGODB_AUDIT_URL!,
      collection: 'audit_logs',
      capped: true,
      cappedSize: 100000000 // 100MB
    })
  ]
});

export async function createAuditLog(data: {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  additionalData?: any;
}): Promise<void> {
  try {
    // Salvar no banco de dados
    await prisma.auditLogs.create({
      data: {
        ...data,
        createdAt: new Date()
      }
    });

    // Salvar no arquivo de log
    auditLogger.info({
      ...data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Não falhar a operação principal se o log falhar
  }
}

// Middleware para auditoria automática
export function auditMiddleware(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Capturar response original
    const originalSend = res.send;
    let responseData: any;
    
    res.send = function(data: any) {
      responseData = data;
      return originalSend.call(this, data);
    };
    
    // Continuar
    next();
    
    // Após a resposta
    res.on('finish', async () => {
      await createAuditLog({
        userId: req.user?.id || 'anonymous',
        action,
        entityType: req.params.entityType,
        entityId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        additionalData: {
          method: req.method,
          path: req.path,
          query: req.query,
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          requestBody: req.method === 'POST' ? req.body : undefined,
          responseData: res.statusCode < 400 ? responseData : undefined
        }
      });
    });
  };
}
```

---

## 7. CONFIGURAÇÃO

### 7.1 Variáveis de Ambiente

```bash
# .env.example

# Application
NODE_ENV=production
APP_NAME="Sistema de Cadastro Facial"
APP_URL=https://cadastro.evento.com
APP_PORT=4000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/facial_events"
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=
REDIS_DB=0

# Storage (MinIO/S3)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=facial-images
S3_REGION=us-east-1

# Security
MASTER_KEY=your-32-character-master-encryption-key
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=1h
SESSION_SECRET=your-session-secret
CORS_ORIGINS=https://cadastro.evento.com

# HikCenter Integration
HIKCENTER_URL=https://hikcenter.local
HIKCENTER_USER=admin
HIKCENTER_PASS=secure_password
HIKCENTER_API_KEY=your-api-key
HIKCENTER_API_SECRET=your-api-secret

# LGPD/Compliance
COMPANY_NAME="Empresa Organizadora"
COMPANY_CNPJ="00.000.000/0001-00"
DPO_EMAIL=dpo@empresa.com
DPO_PHONE=+5551999999999
DATA_RETENTION_DAYS=90

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@evento.com
SMTP_PASS=your-email-password
SMTP_FROM="Sistema de Cadastro <noreply@evento.com>"

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
NEW_RELIC_LICENSE_KEY=your-license-key
GRAFANA_URL=http://localhost:3000
PROMETHEUS_URL=http://localhost:9090

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Feature Flags
ENABLE_FACE_LIVENESS=true
ENABLE_DUPLICATE_CHECK=true
ENABLE_AUTO_SYNC=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

### 7.2 Configuração do NGINX

```nginx
# /etc/nginx/sites-available/facial-registration

upstream backend {
    least_conn;
    server 127.0.0.1:4000 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:4001 weight=1 max_fails=3 fail_timeout=30s backup;
}

server {
    listen 80;
    server_name cadastro.evento.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cadastro.evento.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/cadastro.evento.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cadastro.evento.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://cadastro.evento.com;" always;

    # Logs
    access_log /var/log/nginx/facial-registration-access.log combined;
    error_log /var/log/nginx/facial-registration-error.log error;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml application/atom+xml image/svg+xml text/javascript application/x-font-ttf font/opentype application/vnd.ms-fontobject image/x-icon;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=registration:10m rate=1r/s;

    # Frontend
    location / {
        root /var/www/facial-registration/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Registration endpoint with stricter rate limiting
    location /api/v1/registration {
        limit_req zone=registration burst=5 nodelay;
        
        # Limit body size for image uploads
        client_max_body_size 10M;
        
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for real-time updates
    location /ws/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

---

## 8. DEPLOY E DEVOPS

### 8.1 Docker Configuration

```dockerfile
# Dockerfile.frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copy source code
COPY frontend/ .

# Build
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

```dockerfile
# Dockerfile.backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY backend/ .

# Build
RUN npm run build
RUN npx prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

### 8.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: facial-registration-api
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: facial-registration-api
  template:
    metadata:
      labels:
        app: facial-registration-api
    spec:
      containers:
      - name: api
        image: registry.empresa.com/facial-registration-api:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: facial-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: facial-secrets
              key: redis-url
        - name: MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: facial-secrets
              key: master-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /app/config
          readOnly: true
      volumes:
      - name: config
        configMap:
          name: facial-config
---
apiVersion: v1
kind: Service
metadata:
  name: facial-registration-api
  namespace: production
spec:
  selector:
    app: facial-registration-api
  ports:
  - port: 80
    targetPort: 4000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: facial-registration-api-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: facial-registration-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 8.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: registry.empresa.com
  IMAGE_NAME: facial-registration

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run security audit
      run: npm audit --audit-level=high
    
    - name: SonarCloud Scan
      uses: sonarsource/sonarcloud-github-action@master
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Log in to Registry
      uses: docker/login-action@v2
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}
    
    - name: Build and push Frontend
      uses: docker/build-push-action@v4
      with:
        context: .
        file: ./docker/Dockerfile.frontend
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:latest
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:${{ github.sha }}
        cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:buildcache
        cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:buildcache,mode=max
    
    - name: Build and push Backend
      uses: docker/build-push-action@v4
      with:
        context: .
        file: ./docker/Dockerfile.backend
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-backend:latest
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-backend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
      with:
        version: 'v1.28.0'
    
    - name: Configure kubectl
      run: |
        echo "${{ secrets.KUBE_CONFIG }}" | base64 -d > kubeconfig
        export KUBECONFIG=kubeconfig
    
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/facial-registration-api \
          api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-backend:${{ github.sha }} \
          -n production
        
        kubectl set image deployment/facial-registration-frontend \
          frontend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:${{ github.sha }} \
          -n production
        
        kubectl rollout status deployment/facial-registration-api -n production
        kubectl rollout status deployment/facial-registration-frontend -n production
    
    - name: Run smoke tests
      run: |
        chmod +x ./scripts/smoke-tests.sh
        ./scripts/smoke-tests.sh
    
    - name: Notify Slack
      if: always()
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        text: 'Deploy to production: ${{ job.status }}'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 9. TROUBLESHOOTING

### 9.1 Problemas Comuns e Soluções

```yaml
Problem: Câmera não funciona no iOS Safari
Solution:
  - Verificar HTTPS (obrigatório)
  - Adicionar playsinline no video element
  - Verificar permissões do navegador
  - Código:
    ```javascript
    const video = document.querySelector('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    ```

Problem: Erro de CORS na API
Solution:
  - Verificar configuração CORS no backend
  - Adicionar headers corretos no NGINX
  - Código:
    ```javascript
    app.use(cors({
      origin: process.env.CORS_ORIGINS.split(','),
      credentials: true
    }));
    ```

Problem: Upload de imagem falha
Solution:
  - Verificar tamanho máximo (client_max_body_size)
  - Verificar formato da imagem
  - Verificar conectividade S3/MinIO
  - Logs: tail -f /var/log/nginx/error.log

Problem: Sincronização HikCenter falha
Solution:
  - Verificar credenciais da API
  - Verificar conectividade de rede
  - Verificar formato dos dados
  - Verificar logs: docker logs facial-sync-service

Problem: Database connection pool exhausted
Solution:
  - Aumentar pool size
  - Verificar queries não finalizadas
  - Adicionar connection timeout
  - Configuração:
    ```javascript
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
      connectionLimit = 10
      connectTimeout = 10
    }
    ```

Problem: Redis memory full
Solution:
  - Configurar maxmemory policy
  - Limpar cache expirado
  - Aumentar memória disponível
  - Comando: redis-cli FLUSHDB

Problem: Certificado SSL expirado
Solution:
  - Renovar com Let's Encrypt
  - Comando: certbot renew --nginx
  - Verificar auto-renovação no cron

Problem: Alta latência na API
Solution:
  - Verificar índices do banco
  - Implementar cache Redis
  - Otimizar queries N+1
  - Adicionar paginação
  - Usar query profiling

Problem: Falha no health check
Solution:
  - Verificar conectividade database
  - Verificar memória disponível
  - Verificar logs da aplicação
  - Reiniciar serviços
```

### 9.2 Scripts de Diagnóstico

```bash
#!/bin/bash
# diagnostic.sh - Script de diagnóstico do sistema

echo "=== Sistema de Cadastro Facial - Diagnóstico ==="
echo ""

# Verificar serviços
echo "1. Status dos Serviços:"
systemctl status nginx | grep Active
systemctl status postgresql | grep Active
systemctl status redis | grep Active
docker ps --format "table {{.Names}}\t{{.Status}}"

# Verificar conectividade
echo ""
echo "2. Conectividade:"
curl -s -o /dev/null -w "API: %{http_code}\n" https://localhost/api/health
curl -s -o /dev/null -w "Frontend: %{http_code}\n" https://localhost/
pg_isready -h localhost -p 5432
redis-cli ping

# Verificar recursos
echo ""
echo "3. Recursos do Sistema:"
df -h | grep -E "^/dev/"
free -h
top -bn1 | head -5

# Verificar logs recentes
echo ""
echo "4. Erros Recentes (últimas 50 linhas):"
tail -50 /var/log/nginx/error.log | grep -E "error|crit|alert|emerg" || echo "Sem erros no NGINX"
docker logs facial-api --tail 50 2>&1 | grep -E "ERROR|FATAL" || echo "Sem erros na API"

# Verificar certificado SSL
echo ""
echo "5. Certificado SSL:"
echo | openssl s_client -servername cadastro.evento.com -connect cadastro.evento.com:443 2>/dev/null | openssl x509 -noout -dates

# Verificar fila Redis
echo ""
echo "6. Filas de Processamento:"
redis-cli LLEN sync:queue
redis-cli LLEN failed:queue

# Verificar banco de dados
echo ""
echo "7. Estatísticas do Banco:"
psql -U facial_user -d facial_events -c "SELECT 'Participantes' as tabela, COUNT(*) as total FROM participants UNION SELECT 'Sincronizações Pendentes', COUNT(*) FROM hikcenter_sync WHERE sync_status = 'pending';"

echo ""
echo "=== Diagnóstico Completo ==="
```

---

## 10. RUNBOOK OPERACIONAL

### 10.1 Procedimentos Diários

```markdown
## Check-list Diário (08:00)

### 1. Verificação de Saúde
- [ ] Acessar dashboard de monitoramento
- [ ] Verificar status dos serviços
- [ ] Checar alertas noturnos
- [ ] Revisar logs de erro

### 2. Métricas de Performance
- [ ] Response time < 3s
- [ ] Error rate < 1%
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%

### 3. Filas e Jobs
- [ ] Verificar fila de sincronização
- [ ] Processar failed jobs
- [ ] Verificar jobs agendados

### 4. Backup
- [ ] Confirmar backup noturno
- [ ] Verificar integridade
- [ ] Testar restore (semanal)

### Comandos Úteis:
```bash
# Status geral
./scripts/diagnostic.sh

# Verificar filas
redis-cli LLEN sync:queue

# Reprocessar falhas
npm run jobs:retry

# Backup manual
./scripts/backup.sh
```

### 10.2 Procedimentos de Manutenção

```markdown
## Manutenção Programada

### Antes da Manutenção
1. Notificar usuários (24h antes)
2. Fazer backup completo
3. Preparar rollback plan
4. Colocar página de manutenção

### Durante a Manutenção
1. Parar serviços gracefully
2. Aplicar updates
3. Run migrations
4. Verificar configurações
5. Restart serviços
6. Smoke tests

### Após a Manutenção
1. Verificar todos os serviços
2. Monitorar por 30 minutos
3. Notificar conclusão
4. Documentar mudanças
```

### 10.3 Resposta a Incidentes

```markdown
## Playbook de Incidentes

### Severidade 1 - Sistema Fora
**Tempo de Resposta: 15 minutos**

1. **Identificar**
   - Verificar monitoring
   - Confirmar impacto
   - Notificar equipe

2. **Diagnosticar**
   ```bash
   ./scripts/diagnostic.sh
   docker logs facial-api --tail 100
   ```

3. **Mitigar**
   - Restart serviços se necessário
   - Ativar modo degradado
   - Redirecionar tráfego

4. **Resolver**
   - Identificar root cause
   - Aplicar fix
   - Validar solução

5. **Documentar**
   - Criar post-mortem
   - Atualizar runbook
   - Compartilhar learnings

### Severidade 2 - Degradação
**Tempo de Resposta: 30 minutos**

1. Verificar métricas
2. Identificar bottleneck
3. Scale horizontalmente se necessário
4. Otimizar queries/cache
5. Monitorar recovery

### Severidade 3 - Erro Isolado
**Tempo de Resposta: 2 horas**

1. Coletar logs
2. Reproduzir erro
3. Desenvolver fix
4. Deploy em staging
5. Deploy em produção
```

### 10.4 Disaster Recovery

```markdown
## Plano de Recuperação de Desastres

### RTO: 4 horas | RPO: 1 hora

### Cenário 1: Falha do Banco de Dados
1. Promover replica para master
2. Atualizar connection strings
3. Verificar integridade
4. Sincronizar dados perdidos

### Cenário 2: Falha do Datacenter
1. Ativar site secundário
2. Atualizar DNS
3. Verificar sincronização
4. Notificar usuários

### Cenário 3: Comprometimento de Segurança
1. Isolar sistemas afetados
2. Revogar credenciais
3. Análise forense
4. Restore from clean backup
5. Notificar DPO e autoridades

### Backup & Restore
```bash
# Backup completo
pg_dump facial_events > backup_$(date +%Y%m%d).sql
tar -czf images_$(date +%Y%m%d).tar.gz /data/images

# Restore database
psql facial_events < backup_20250808.sql

# Restore images
tar -xzf images_20250808.tar.gz -C /data/
```

---

## 📎 ANEXOS

### A. Checklist de Lançamento

- [ ] Código revisado e aprovado
- [ ] Testes com cobertura > 80%
- [ ] Documentação completa
- [ ] Segurança validada
- [ ] LGPD compliance verificado
- [ ] Performance testada
- [ ] Backup configurado
- [ ] Monitoramento ativo
- [ ] SSL configurado
- [ ] DNS configurado
- [ ] Equipe treinada
- [ ] Suporte preparado
- [ ] Comunicação enviada
- [ ] Rollback plan pronto
- [ ] Go-live aprovado

### B. Contatos de Emergência

```yaml
Escalation Matrix:
  Level 1:
    - DevOps: +55 51 9XXXX-XXXX
    - On-call Dev: +55 51 9XXXX-XXXX
  
  Level 2:
    - Tech Lead: +55 51 9XXXX-XXXX
    - PM: +55 51 9XXXX-XXXX
  
  Level 3:
    - CTO: +55 51 9XXXX-XXXX
    - DPO: +55 51 9XXXX-XXXX

External:
  - HikCenter Support: support@hikvision.com
  - Hosting Provider: +55 11 XXXX-XXXX
  - Security Team: security@empresa.com
```

---

**FIM DA DOCUMENTAÇÃO TÉCNICA**

Versão: 1.0
Data: 08/08/2025
Mantido por: Equipe de Desenvolvimento