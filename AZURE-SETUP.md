# 🎯 Configuração do Microsoft Azure Face API

## Visão Geral

O sistema utiliza **Microsoft Azure Face API** para detecção e reconhecimento facial em tempo real. Este documento explica como configurar o serviço Azure para integração com o sistema de cadastramento.

## 🚀 Passo a Passo para Configuração

### 1. Criar uma Conta Azure
1. Acesse [portal.azure.com](https://portal.azure.com)
2. Crie uma conta gratuita (inclui $200 de créditos por 30 dias)
3. Faça login no Azure Portal

### 2. Criar Recurso Face API
1. No Azure Portal, clique em **"Create a resource"**
2. Procure por **"Face"** na barra de pesquisa
3. Selecione **"Face"** da Microsoft
4. Clique em **"Create"**

### 3. Configurar o Recurso
Preencha os campos:
- **Subscription**: Selecione sua assinatura
- **Resource group**: Crie novo ou use existente (ex: "MegaFeira")
- **Region**: Brazil South (mais próximo)
- **Name**: Nome único (ex: "megafeira-face")
- **Pricing tier**: 
  - **F0 (Free)**: 20 chamadas/min, 30K chamadas/mês
  - **S0 (Standard)**: Para produção, pague conforme uso

### 4. Obter Credenciais
Após criação do recurso:
1. Vá para o recurso criado
2. No menu lateral, clique em **"Keys and Endpoint"**
3. Copie:
   - **KEY 1** ou **KEY 2** (qualquer uma funciona)
   - **Endpoint** (ex: https://megafeira-face.cognitiveservices.azure.com)

### 5. Configurar no Sistema

Adicione as credenciais no arquivo `.env.local`:

```env
# Azure Face API Configuration
AZURE_FACE_ENDPOINT="https://SEU-RECURSO.cognitiveservices.azure.com"
AZURE_FACE_KEY="sua-chave-api-aqui"
```

## 📊 Recursos do Sistema

### Detecção Facial em Tempo Real
- ✅ Detecta rostos na câmera a cada segundo
- ✅ Mostra caixa verde ao redor do rosto detectado
- ✅ Indica quantos rostos estão na imagem
- ✅ Valida qualidade da imagem

### Análise de Qualidade
O sistema verifica automaticamente:
- **Desfoque**: Imagem está nítida?
- **Exposição**: Iluminação adequada?
- **Ruído**: Imagem limpa?
- **Oclusão**: Rosto está descoberto?
- **Tamanho**: Rosto grande o suficiente?

### Score de Qualidade
- 🟢 **0.7 - 1.0**: Boa qualidade (aprovado)
- 🟡 **0.5 - 0.7**: Qualidade média (aceitável)
- 🔴 **0.0 - 0.5**: Baixa qualidade (rejeitar)

## 💰 Custos Estimados

### Tier Gratuito (F0)
- **Limite**: 30,000 chamadas/mês
- **Velocidade**: 20 chamadas/minuto
- **Custo**: GRÁTIS
- **Ideal para**: Desenvolvimento e testes

### Tier Standard (S0)
- **Detecção**: $1 por 1,000 chamadas
- **Verificação**: $1 por 1,000 chamadas
- **Identificação**: $1 por 1,000 chamadas

### Estimativa para 2,000 Participantes
- Detecção durante captura: ~6 chamadas/pessoa = 12,000 chamadas
- Custo estimado: **$12 USD** (≈ R$ 60)

## 🔒 Segurança

### Boas Práticas
1. **Nunca exponha as chaves** no código frontend
2. **Use variáveis de ambiente** para armazenar credenciais
3. **Rotacione as chaves** periodicamente
4. **Configure CORS** no Azure para permitir apenas seu domínio
5. **Monitore uso** para detectar anomalias

### Conformidade LGPD
- ✅ Dados biométricos criptografados
- ✅ Consentimento explícito coletado
- ✅ Retenção automática de 90 dias
- ✅ Direito ao esquecimento implementado

## 🧪 Modo de Desenvolvimento

Se você não configurar as credenciais Azure, o sistema funcionará em **modo mock**:
- Simula detecção facial
- Retorna dados fictícios
- Permite testar o fluxo completo
- Sem custos

## 📱 Requisitos do Cliente

### Navegadores Suportados
- ✅ Chrome 90+ (Android/Desktop)
- ✅ Safari 14.1+ (iOS/macOS)
- ✅ Edge 90+ (Windows)
- ✅ Firefox 88+ (Desktop)

### Permissões Necessárias
- Acesso à câmera
- HTTPS (obrigatório para câmera)

## 🔧 Troubleshooting

### Erro: "Azure Face API authentication failed"
**Solução**: Verifique se a chave API está correta no `.env.local`

### Erro: "Rate limit exceeded"
**Solução**: 
- Tier F0: Aguarde 1 minuto (limite de 20 chamadas/min)
- Considere upgrade para S0

### Erro: "No face detected"
**Causas comuns**:
- Iluminação inadequada
- Rosto muito pequeno ou distante
- Múltiplas pessoas na imagem
- Óculos escuros ou máscara

### Câmera não funciona
**Verificar**:
1. Site está em HTTPS?
2. Permissão de câmera concedida?
3. Outra aplicação usando a câmera?

## 📚 Recursos Adicionais

- [Documentação Azure Face API](https://docs.microsoft.com/azure/cognitive-services/face/)
- [Preços Azure Face](https://azure.microsoft.com/pricing/details/cognitive-services/face-api/)
- [Quickstart Guide](https://docs.microsoft.com/azure/cognitive-services/face/quickstarts/client-libraries)
- [API Reference](https://westus.dev.cognitive.microsoft.com/docs/services/563879b61984550e40cbbe8d/)

## 🎯 Próximos Passos

1. **Configure Azure**: Siga os passos 1-4
2. **Adicione credenciais**: Atualize `.env.local`
3. **Teste localmente**: `npm run dev`
4. **Monitore uso**: Verifique métricas no Azure Portal
5. **Ajuste qualidade**: Configure thresholds conforme necessário

---

**Suporte**: Em caso de dúvidas sobre Azure Face API, consulte a [documentação oficial](https://docs.microsoft.com/azure/cognitive-services/face/) ou abra um ticket no suporte Azure.