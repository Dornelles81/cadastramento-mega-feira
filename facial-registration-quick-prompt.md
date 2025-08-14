# Quick Start Prompt - Sistema de Cadastro Facial

## 🎯 PROMPT EXECUTIVO DIRETO

```markdown
Você é um desenvolvedor full-stack senior. Preciso que você crie um sistema web de cadastro facial para um evento com 2000 participantes.

REQUISITOS ESSENCIAIS:
- Captura facial via câmera do smartphone (navegador web)
- Funcionar em iOS Safari e Android Chrome
- Coletar: nome, CPF e foto facial
- Integrar com HikCenter via REST API
- Conformidade total com LGPD
- Pronto em 60 dias

STACK OBRIGATÓRIO:
- Frontend: React + Vite + MediaPipe + TypeScript
- Backend: Node.js + Express + Prisma + PostgreSQL
- Cache: Redis
- Storage: MinIO (S3)
- Deploy: Docker + NGINX

ENTREGÁVEIS PRIORITÁRIOS:
1. Componente de captura facial funcionando em mobile
2. API de registro com validação de CPF
3. Integração batch com HikCenter (max 100 registros)
4. Criptografia AES-256 para dados biométricos
5. Sistema de consentimento LGPD com exclusão automática em 90 dias

Comece criando o componente React de captura facial com MediaPipe que funcione no iOS Safari.
```

---

## 🚀 COMANDOS RÁPIDOS PARA TAREFAS ESPECÍFICAS

### Para criar o componente de captura facial:
```
"Crie um componente React com TypeScript que capture faces usando MediaPipe Face Detection, com feedback visual em tempo real (círculo verde quando face detectada), validação de qualidade, e que funcione no iOS Safari com playsinline."
```

### Para criar a API de registro:
```
"Crie uma API REST com Express e TypeScript que receba dados pessoais (nome, CPF) e imagem facial em base64, valide CPF, salve no PostgreSQL usando Prisma, criptografe o template biométrico com AES-256, e registre o consentimento LGPD."
```

### Para integrar com HikCenter:
```
"Crie um serviço Node.js que sincronize dados com HikCenter Professional via REST API, enviando batches de até 100 pessoas, com autenticação Digest, retry automático, rate limiting de 10 req/s, e webhook handler para eventos."
```

### Para implementar LGPD:
```
"Implemente um sistema de gestão de consentimento LGPD que registre aceite com timestamp/IP, permita revogação, agende exclusão automática após 90 dias, crie logs de auditoria imutáveis, e forneça endpoints para exercício dos direitos do titular."
```

### Para configurar o deploy:
```
"Crie Dockerfiles multi-stage para frontend React e backend Node.js, docker-compose com PostgreSQL/Redis/MinIO, configuração NGINX com SSL e rate limiting, e GitHub Actions para CI/CD com testes automatizados."
```

---

## 📋 CHECKLIST RÁPIDO DE VALIDAÇÃO

```yaml
Antes de cada entrega, confirme:
□ Funciona no iOS Safari?
□ Funciona no Android Chrome?
□ CPF está sendo validado?
□ Dados estão criptografados?
□ Consentimento está registrado?
□ Sincroniza com HikCenter?
□ Tem tratamento de erros?
□ Tem logs de auditoria?
□ Tem testes unitários?
□ Código está documentado?
```

---

## 🔥 SNIPPETS ESSENCIAIS

### Detecção facial com MediaPipe:
```javascript
const faceDetection = new FaceDetection({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
});
faceDetection.setOptions({
  modelSelection: 0,
  minDetectionConfidence: 0.5
});
```

### Validação de CPF:
```javascript
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  // Implementar algoritmo completo de validação
  return true;
}
```

### Criptografia AES-256:
```javascript
const crypto = require('crypto');
const algorithm = 'aes-256-gcm';
const key = Buffer.from(process.env.MASTER_KEY, 'hex');
```

### HikCenter batch upload:
```javascript
const batch = {
  faceLibType: "blackFD",
  FDID: "1",
  employeeList: participants.map(p => ({
    employeeNo: p.id,
    employeeName: p.name,
    faceURL: p.faceTemplate,
    cardNo: p.cpf
  }))
};
```

---

## 💬 DIÁLOGOS DE DESENVOLVIMENTO

### Início do projeto:
**Você:** "Use o master prompt do sistema de cadastro facial"
**Claude:** "Entendi. Vou criar o sistema de cadastro facial com React, MediaPipe, integração HikCenter e LGPD compliance. Começando pelo componente de captura..."

### Durante desenvolvimento:
**Você:** "A câmera não abre no iPhone"
**Claude:** "Vou verificar: 1) HTTPS ativo? 2) playsinline adicionado? 3) Permissões solicitadas? Aqui está a correção..."

### Problemas de integração:
**Você:** "HikCenter retorna erro 400"
**Claude:** "Verificando formato dos dados. HikCenter espera batch máximo de 100 registros e template em base64. Ajustando o payload..."

### Validação LGPD:
**Você:** "Preciso do relatório de conformidade LGPD"
**Claude:** "Gerando checklist: ✓ Consentimento registrado ✓ Criptografia AES-256 ✓ Exclusão automática ✓ Logs de auditoria..."

---

## 🎪 MODO TURBO

Para desenvolvimento acelerado, use este comando único:

```
"MODO TURBO: Crie o sistema completo de cadastro facial seguindo o master prompt, priorizando:
1. MVP funcional em 2 semanas
2. Captura facial mobile-first
3. Integração HikCenter básica
4. LGPD mínimo viável
5. Deploy com Docker

Gere os arquivos principais: FaceCapture.tsx, registration.controller.ts, hikcenter.service.ts, docker-compose.yml"
```

---

## 📱 TESTE RÁPIDO MOBILE

```bash
# Para testar rapidamente em mobile:
npm run build
npx serve -s dist -l 3000 --ssl-cert cert.pem --ssl-key key.pem
# Acesse: https://[seu-ip-local]:3000 no celular
```

---

## 🆘 COMANDO DE EMERGÊNCIA

Se algo der muito errado:

```
"HELP! O sistema de cadastro facial não está funcionando. Sintomas: [descreva o problema]. 
Preciso de:
1. Diagnóstico do problema
2. Solução imediata
3. Prevenção futura
Stack: React + Node.js + PostgreSQL + HikCenter"
```

---

**USO DO MASTER PROMPT:**

1. **Copie o Master Prompt completo** para referência detalhada
2. **Use o Quick Start** para começar rapidamente  
3. **Execute os comandos específicos** conforme necessidade
4. **Valide com o checklist** antes de cada entrega
5. **Use os snippets** para acelerar desenvolvimento

Este sistema de prompts garante sucesso na implementação!