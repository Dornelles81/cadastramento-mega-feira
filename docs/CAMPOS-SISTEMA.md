# Sistema de Campos - Documentação Completa

## Visão Geral

Este sistema possui **DOIS tipos diferentes** de campos para coleta de dados:

### 1. CustomField (Campos Simples)
- **Localização**: Gerenciados em `/admin/eventos/[slug]/campos`
- **Tipos**: text, email, tel, select, textarea, file (upload simples)
- **Interface**: Upload de arquivo básico (sem câmera)
- **OCR**: Não suporta
- **Uso**: Campos personalizados simples como endereço, ocupação, etc.

### 2. DocumentConfig (Campos com Câmera + OCR)
- **Localização**: Gerenciados em `/admin/documents`
- **Tipos**: CNH, RG, CPF, Passaporte, etc.
- **Interface**: Botões "Câmera" + "Arquivo" (escolha entre tirar foto ou upload)
- **OCR**: Suporta extração automática de dados
- **Uso**: Documentos que precisam de câmera e processamento OCR

---

## Arquitetura

### APIs Públicas

#### `/api/form-fields` (CustomFields)
- Retorna campos personalizados (text, select, file simples)
- Sistema de campos: name, email, phone, cpf
- Campos customizados por evento

#### `/app/api/public/document-fields/route.ts` (DocumentConfigs)
- Retorna configurações de documentos
- Interface de câmera + upload
- Suporte a OCR

### Componentes Frontend

#### `components/DocumentField.tsx`
- Renderiza interface de captura de documentos
- Integra com câmera do dispositivo
- Processa OCR via `http://localhost:8000/ocr/extract-base64`
- Auto-preenche campos do formulário

### Workflow OCR

```
1. Usuário clica em "Câmera" ou "Arquivo"
2. Imagem capturada → Convertida para Base64
3. POST para http://localhost:8000/ocr/extract-base64
   {
     "image": "data:image/jpeg;base64,...",
     "document_type": "CNH"
   }
4. Servidor OCR processa e retorna dados extraídos
5. DocumentField.tsx auto-preenche campos do formulário
```

---

## Configuração CNH com OCR

### Status Atual ✅

```
✅ CustomField "CNH": REMOVIDO (evita conflito)
✅ DocumentConfig "CNH": ATIVO
   - Interface: Câmera + Arquivo
   - OCR: Ativo
   - Obrigatório: Sim
   - Formato: JPG, JPEG, PNG
   - Tamanho máx: 5MB
```

### Scripts Disponíveis

#### 1. Ativar CNH com OCR
```bash
node scripts/enable-cnh-document.js
```
- Ativa ou cria DocumentConfig para CNH
- Habilita OCR automático
- Define como campo obrigatório

#### 2. Remover CustomField CNH Conflitante
```bash
node scripts/remove-cnh-custom-field.js
```
- Remove CustomField "CNH" (upload simples)
- Mantém apenas DocumentConfig (câmera + OCR)

#### 3. Verificar Configuração
```bash
node scripts/verify-cnh-setup.js
```
- Verifica se há conflitos
- Mostra todos os campos ativos
- Confirma configuração correta

#### 4. Desativar Todos os Documentos
```bash
node scripts/disable-all-document-fields.js
```
- Desativa todos os DocumentConfigs
- Útil para começar do zero

---

## Exemplo: Adicionar Novo Documento com OCR

### 1. Via Script (Recomendado)

```javascript
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const event = await prisma.event.findFirst({
    where: { code: 'MEGA-FEIRA-2025' }
  })

  await prisma.documentConfig.create({
    data: {
      eventId: event.id,
      documentType: 'RG',
      label: 'RG - Registro Geral',
      description: 'Tire uma foto do seu RG ou faça upload',
      required: true,
      enableOCR: true,          // ← Ativa OCR
      acceptedFormats: ['jpg', 'jpeg', 'png'],
      maxSizeMB: 5,
      order: 20,
      active: true,
      icon: '🆔',
      helpText: 'O sistema vai extrair automaticamente seus dados do RG'
    }
  })
}

main()
```

### 2. Via Interface Admin

1. Acesse `/admin/documents`
2. Clique em "Novo Documento"
3. Preencha:
   - **Tipo**: RG
   - **Label**: RG - Registro Geral
   - **OCR**: ✅ Habilitado
   - **Obrigatório**: Sim
4. Salvar

---

## Troubleshooting

### Problema: Campo aparece como upload simples (sem câmera)

**Causa**: Campo criado como CustomField em vez de DocumentConfig

**Solução**:
1. Deletar CustomField em `/admin/eventos/[slug]/campos`
2. Criar DocumentConfig em `/admin/documents` com `enableOCR: true`

### Problema: Dados não sincronizam após adicionar/remover campo

**Causa**: Cache do navegador ou cache interno

**Solução**:
1. **Hard refresh** no navegador (Ctrl+Shift+R / Cmd+Shift+R)
2. Cache interno é invalidado automaticamente nas APIs admin

### Problema: OCR não está funcionando

**Verificar**:
1. Servidor OCR está rodando? `http://localhost:8000/docs`
2. DocumentConfig tem `enableOCR: true`?
3. Console do navegador mostra erros?

**Solução**:
```bash
# Iniciar servidor OCR
cd ocr-service
powershell -Command "& .\venv\Scripts\python.exe simple_ocr.py"
```

### Problema: Conflito entre CustomField e DocumentConfig

**Sintoma**: Aparece campo duplicado (um com câmera, outro sem)

**Solução**:
```bash
node scripts/remove-cnh-custom-field.js  # Remove CustomField
node scripts/verify-cnh-setup.js         # Verifica configuração
```

---

## Cache System

### Cache Interno (lib/cache.ts)

```javascript
invalidateFieldsCache(eventId)    // Invalida cache de campos
invalidateEventCache(eventId)     // Invalida cache de eventos
```

### HTTP Cache Headers

Todas as APIs públicas retornam headers para evitar cache do navegador:

```javascript
{
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
}
```

---

## Arquivos Importantes

### Scripts de Manutenção
- `scripts/enable-cnh-document.js` - Ativar CNH com OCR
- `scripts/remove-cnh-custom-field.js` - Remover CNH customizado
- `scripts/verify-cnh-setup.js` - Verificar configuração
- `scripts/disable-all-document-fields.js` - Desativar todos documentos
- `scripts/disable-document-fields.js` - Desativar documentos do evento

### Componentes
- `components/DocumentField.tsx` - Interface de captura com OCR
- `lib/cache.ts` - Sistema de cache com invalidação

### APIs
- `app/api/public/document-fields/route.ts` - API de documentos (App Router)
- `pages/api/form-fields.ts` - API de campos customizados (Pages Router)
- `pages/api/admin/fields.ts` - CRUD de campos customizados

### Serviço OCR
- `ocr-service/simple_ocr.py` - Servidor OCR mock para testes
- `ocr-service/start_ocr.bat` - Script de inicialização

---

## Best Practices

### ✅ DO

1. **Use DocumentConfig** para documentos que precisam de câmera/OCR
2. **Use CustomField** para campos simples (texto, select)
3. **Execute verify-cnh-setup.js** antes de deploy
4. **Teste OCR** em dispositivos móveis reais
5. **Monitore logs** do servidor OCR

### ❌ DON'T

1. **Não crie** CustomField tipo "file" para documentos com OCR
2. **Não misture** CustomField e DocumentConfig para o mesmo documento
3. **Não desative** cache invalidation nas APIs admin
4. **Não use** cache do navegador para APIs públicas
5. **Não esqueça** de iniciar servidor OCR antes de testar

---

## Estado Atual do Sistema

### Campos Ativos

**Custom Fields**:
- ✅ Nome (sistema)
- ✅ Email (sistema)
- ✅ Telefone (sistema)
- ✅ Instruções (global)
- ✅ Mensagem de sucesso (global)

**Document Configs**:
- ✅ CNH - Carteira Nacional de Habilitação
  - Interface: Câmera + Arquivo
  - OCR: Ativo
  - Auto-preenche: Nome, CPF, Data de Nascimento, Número CNH

### Serviços Ativos

- ✅ Next.js Dev Server: `http://localhost:3000`
- ✅ OCR Service: `http://localhost:8000`
- ✅ Prisma Studio: `npx prisma studio`

### URLs de Teste

- Formulário Público: `http://localhost:3000/?event=mega-feira-2025`
- Admin Campos: `http://localhost:3000/admin/eventos/mega-feira-2025/campos`
- Admin Documentos: `http://localhost:3000/admin/documents`
- OCR API Docs: `http://localhost:8000/docs`

---

## Referências

- Prisma Schema: `prisma/schema.prisma`
- CLAUDE.md: Instruções para Claude Code
- README.md: Guia de setup do projeto
