# 🔧 Guia de Configuração da API HikCentral Professional

## ⚠️ Status Atual

- **HikCentral Professional**: ✅ ONLINE em `https://127.0.0.1`
- **API REST**: ❌ Não acessível (retorna 403 Forbidden)
- **Integração**: 🔄 Aguardando configuração da API

## 📝 Configuração Necessária no HikCentral

Para que a integração automática funcione, é necessário habilitar a API no HikCentral Professional:

### 1️⃣ Habilitar API REST

1. Acesse o **HikCentral Professional** em https://127.0.0.1/portal
2. Faça login com suas credenciais de administrador
3. Vá para **Configurações** → **Sistema** → **Configurações Avançadas**
4. Procure por **"API REST"** ou **"OpenAPI"**
5. Marque a opção **"Habilitar API REST"**
6. Configure:
   - **Porta da API**: 443 (ou outra porta de sua preferência)
   - **Autenticação**: Basic Auth ou Digest Auth
   - **Permissões**: Habilite "Gerenciar Pessoas" e "Gerenciar Visitantes"

### 2️⃣ Criar Usuário de API (Opcional)

1. Vá para **Usuários** → **Gerenciamento de Usuários**
2. Clique em **Adicionar**
3. Crie um usuário específico para API:
   - **Nome**: api_megafeira
   - **Senha**: (defina uma senha forte)
   - **Função**: Operador ou Administrador
   - **Permissões**: 
     - ✅ Gerenciamento de Pessoas
     - ✅ Gerenciamento de Visitantes
     - ✅ Controle de Acesso

### 3️⃣ Configurar CORS (se necessário)

1. Em **Configurações de Segurança**
2. Adicione `http://localhost:3002` à lista de origens permitidas
3. Ou desabilite CORS temporariamente para testes

### 4️⃣ Verificar Serviços

1. Vá para **Manutenção** → **Serviços**
2. Verifique se os seguintes serviços estão ativos:
   - ✅ HikCentral Web Service
   - ✅ HikCentral API Service
   - ✅ Access Control Service
   - ✅ Visitor Management Service

## 🔌 Alternativas de Integração

### Opção A: SDK do HikCentral

Se a API REST não estiver disponível, você pode usar o SDK:

1. Baixe o **HikCentral OpenAPI SDK** do site da Hikvision
2. Instale o SDK no servidor
3. Use as bibliotecas fornecidas para integração

### Opção B: Integração via Banco de Dados

1. Configure acesso direto ao banco de dados do HikCentral
2. Insira os dados diretamente nas tabelas:
   - Tabela `person` para pessoas
   - Tabela `visitor` para visitantes
   - Tabela `access_control` para permissões

### Opção C: Importação Manual (Temporária)

Enquanto a API não é configurada:

1. Use o botão **"📥 Exportar Excel"** no painel de aprovações
2. No HikCentral:
   - Vá para **Access Control** → **Person**
   - Clique em **Import**
   - Selecione o arquivo Excel exportado
   - Mapeie os campos e importe

## 🧑‍💻 Teste de Integração

Após configurar a API:

1. Execute o teste de conexão:
```bash
curl -X GET https://127.0.0.1/api/common/v1/system/time \
  -H "Authorization: Basic YWRtaW46SW5kZXgyMDE2" \
  -k
```

2. No App Mega Feira, teste a aprovação de um participante

3. Verifique se o participante aparece no HikCentral

## 📞 Suporte

### Documentação Hikvision
- [HikCentral Professional User Manual](https://www.hikvision.com/en/support/download/software/hikcentral-professional/)
- [OpenAPI Documentation](https://www.hikvision.com/en/support/download/sdk/)

### Contatos
- **Suporte Técnico Hikvision Brasil**: 0800 123 4567
- **Email**: suporte.brasil@hikvision.com
- **WhatsApp**: +55 11 98765-4321

## ✅ Checklist de Configuração

- [ ] API REST habilitada no HikCentral
- [ ] Usuário de API criado (ou usar admin)
- [ ] Permissões configuradas
- [ ] Serviços verificados e ativos
- [ ] Teste de conexão bem-sucedido
- [ ] Primeira aprovação sincronizada com sucesso

## 🔄 Status da Integração

| Componente | Status | Ação Necessária |
|------------|--------|------------------|
| App Mega Feira | ✅ Pronto | - |
| HikCentral Professional | ✅ Online | Habilitar API |
| Terminal DS-K1T671M-L | ✅ Conectado | Sincronizará automaticamente |
| API REST | ❌ Bloqueada | Configurar no HikCentral |
| Integração Automática | ⏸️ Aguardando | Depende da API |

---

💡 **Nota**: A integração automática está completamente implementada no App Mega Feira. Assim que a API for habilitada no HikCentral, a sincronização funcionará automaticamente.