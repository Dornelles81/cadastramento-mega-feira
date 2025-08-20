# 📝 CHANGELOG - Sistema de Cadastramento Mega Feira

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [2.0.0] - 2025-08-20

### 🎉 Nova Versão Principal - Integração HikCentral

Esta versão adiciona integração completa com o sistema HikCentral Professional e terminal Hikvision DS-K1T671M-L.

### ✨ Adicionado
- **Sistema de Aprovação Administrativa**
  - Interface completa para aprovar/rejeitar participantes
  - Visualização de status de sincronização em tempo real
  - Exportação de dados aprovados para Excel
  - Sistema de auditoria e logs detalhados

- **Integração HikCentral Professional**
  - Automação via Puppeteer para adicionar visitantes
  - Múltiplos métodos de integração com fallback automático
  - Login automático e gestão de sessão
  - Sincronização bidirecional com terminal

- **Métodos de Integração**
  - Browser automation (Puppeteer) - método principal
  - Optimus Integration API
  - ISAPI Protocol com Digest Authentication
  - Web API com gestão de sessão

- **Componentes de Integração**
  - Cliente HikCentral com múltiplas estratégias
  - Cliente Hikvision com Digest Auth customizada
  - Sistema de retry e fallback automático
  - Páginas de teste para validação

### 🔧 Modificado
- Schema Prisma com campos de aprovação e sincronização
- Configurações de ambiente para credenciais HikCentral
- Sistema de navegação administrativa
- Package.json com dependências Puppeteer e xml2js

### 🐛 Corrigido
- Autenticação Digest para dispositivos Hikvision
- Persistência de sessão entre páginas administrativas
- Submissão de formulários via automação browser
- Tratamento de erros de sincronização

### 📦 Dependências
- puppeteer: ^24.16.2 (automação de browser)
- xml2js: ^0.6.2 (parsing de respostas XML)
- xlsx: ^0.18.5 (exportação Excel)

---

## [1.2.3] - 2025-08-18

### 🐛 Corrigido
- **Armazenamento de Imagem Facial**
  - Imagem facial agora salva completa no campo `faceImageUrl`
  - Qualidade total preservada para reconhecimento facial
  - Removida limitação anterior que salvava apenas 100 caracteres
  - Suporte para diferentes formatos de dados de qualidade
  - APIs otimizadas para usar `faceImageUrl` diretamente

### 🔄 Modificado
- **Sistema de Imagens**
  - Metadados biométricos separados da imagem principal
  - Admin agora carrega imagens diretamente do banco
  - Redução de chamadas API desnecessárias
  - Melhor performance na exibição de imagens

---

## [1.2.2] - 2025-08-18

### ✨ Adicionado
- **Visualização de Documentos no Admin**
  - Modal aprimorado com layout de duas colunas
  - Coluna esquerda: imagem facial do participante
  - Coluna direita: lista de documentos enviados
  - Preview de documentos com miniatura
  - Botão de download para cada documento
  - Clique para ampliar documento
  - Nova API `/api/admin/participants-full` para dados completos

### 🐛 Corrigido
- Documentos agora são salvos no campo correto (`documents`) ao invés de `customData`
- Separação adequada entre documentos e campos personalizados

---

## [1.2.1] - 2025-08-18

### ✨ Adicionado
- **Interface Inicial Aprimorada**
  - Novo texto de boas-vindas "Bem-vindo ao APP Mega Feira! 🎯"
  - Descrição dos benefícios do aplicativo
  - Guia passo a passo numerado do processo de cadastro
  - Tempo estimado de conclusão (2 minutos)

- **Termos de Uso Completos**
  - Modal com 8 seções detalhadas sobre LGPD
  - Link opcional "📄 Ler termos completos"
  - Informações sobre coleta, uso e proteção de dados
  - Direitos do usuário conforme LGPD
  - Dados de contato para privacidade

### 🔄 Modificado
- **Tela de Consentimento**
  - Removidas seções técnicas (O que coletamos, Finalidade, Retenção)
  - Substituídas por guia visual simples e direto
  - Texto mais amigável e menos técnico

### 🐛 Corrigido
- Erro de hidratação do React
- Data dinâmica substituída por data fixa nos termos
- Formatação do texto do checkbox

---

## [1.2.0] - 2025-08-18

### ✨ Adicionado
- **Sistema OCR para Documentos**
  - Serviço Python com PaddleOCR para extração de texto
  - Validação automática de CPF, RG e CNH brasileiros
  - API REST com FastAPI em `http://localhost:8000`
  - Pré-processamento de imagem para melhor precisão
  - Documentação Swagger automática

- **Sistema de Documentos Configuráveis**
  - Nova tabela `DocumentConfig` no banco de dados
  - Interface admin em `/admin/documents` para gerenciar documentos
  - Componente `DocumentField.tsx` para captura via câmera ou upload
  - Integração com OCR para preenchimento automático
  - Configuração de obrigatoriedade por documento
  - Ordenação customizável de documentos

- **Melhorias no Formulário Dinâmico**
  - Documentos agora aparecem junto com campos de texto
  - Preenchimento automático via OCR
  - Preview de documentos enviados
  - Validação em tempo real

### 🔄 Modificado
- **Fluxo de Cadastro**
  - Removida tela separada de documentos
  - Documentos integrados na tela de dados pessoais
  - Admin controla quais documentos são necessários
  
- **Interface Administrativa**
  - Novo botão "📄 Gerenciar Documentos" no admin
  - Melhor organização dos controles administrativos

- **Banco de Dados**
  - Campo `documents` adicionado à tabela `Participant`
  - Nova tabela `DocumentConfig` para configurações

### 🐛 Corrigido
- Fluxo de navegação entre telas
- Componentes não utilizados removidos
- Imports desnecessários limpos

---

## [1.1.0] - 2025-08-17

### ✨ Adicionado
- Sistema de captura facial com `EnhancedFaceCapture`
- Detecção de face em tempo real
- Indicadores de qualidade de imagem
- Guia visual para posicionamento facial

### 🔄 Modificado
- Melhorias na interface mobile
- Otimização de performance

---

## [1.0.0] - 2025-08-16

### ✨ Lançamento Inicial
- **Sistema de Cadastro**
  - Formulário dinâmico configurável
  - Captura facial via navegador
  - Consentimento LGPD
  
- **Interface Administrativa**
  - Dashboard com estatísticas
  - Gerenciamento de participantes
  - Exportação de dados (CSV/JSON)
  - Configuração de campos customizados

- **Banco de Dados**
  - Integração com NEON PostgreSQL
  - Schema Prisma configurado
  - Migrations automáticas

- **APIs REST**
  - Registro de participantes
  - Upload de imagens
  - APIs administrativas
  - APIs de exportação

- **Segurança**
  - Validação de CPF
  - Criptografia de dados sensíveis
  - Proteção do admin com senha
  - Compliance LGPD

---

## 📋 Roadmap (Próximas Versões)

### [2.1.0] - Planejado
- [ ] Sistema de QR Code para check-in
- [ ] Dashboard com gráficos estatísticos
- [ ] Notificações por email/SMS
- [ ] Relatórios avançados de presença

### [2.2.0] - Planejado
- [ ] Sistema de backup automático
- [ ] Autenticação 2FA para admin
- [ ] Logs de auditoria detalhados
- [ ] API pública documentada

### [3.0.0] - Futuro
- [ ] Aplicativo mobile nativo
- [ ] Reconhecimento facial com IA
- [ ] Multi-tenancy (múltiplos eventos)
- [ ] Sistema de pagamentos integrado

---

## 📊 Estatísticas

### Versão Atual: 2.0.0
- **Total de Commits**: 20+
- **Arquivos**: 100+
- **Linhas de Código**: ~15,000
- **APIs**: 40+ endpoints
- **Componentes React**: 20+
- **Tabelas DB**: 8

---

## 🔗 Links Úteis

- [Documentação](./README.md)
- [Guia de Deploy](./DEPLOY.md)
- [Log de Desenvolvimento](./DESENVOLVIMENTO-LOG.md)
- [Repositório GitHub](#)

---

*Mantido por: Equipe de Desenvolvimento Mega Feira*
*Última atualização: 20/08/2025*