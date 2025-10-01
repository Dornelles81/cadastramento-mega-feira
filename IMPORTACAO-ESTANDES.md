# 📊 Guia de Importação de Estandes via Excel

## 📋 Visão Geral

Sistema completo para importar estandes em massa usando arquivos Excel/CSV, facilitando a configuração inicial e atualização de limites de credenciais.

## 🎯 Funcionalidades

- ✅ **Importação em Massa**: Crie/atualize múltiplos estandes de uma vez
- ✅ **Validação Automática**: Impede redução de limites abaixo do número atual de cadastros
- ✅ **Modelo Pronto**: Arquivo modelo com exemplos para facilitar o preenchimento
- ✅ **Relatório Detalhado**: Mostra quantos estandes foram criados, atualizados e erros encontrados
- ✅ **Segurança**: Requer autenticação de administrador

## 🚀 Como Usar

### Passo 1: Acessar o Painel de Administração

1. Acesse: `http://localhost:3000/admin/stands`
2. Faça login como administrador
3. Clique no botão **"📊 Importar Excel"**

### Passo 2: Baixar o Modelo

1. No modal que abrir, clique em **"⬇️ Baixar Modelo Excel"**
2. O arquivo `modelo-importacao-estandes.csv` será baixado
3. Abra o arquivo no Excel, Google Sheets ou outro editor de planilhas

### Passo 3: Preencher os Dados

O arquivo modelo contém as seguintes colunas:

| Coluna | Obrigatório | Descrição | Exemplo |
|--------|-------------|-----------|---------|
| **Nome do Estande** | ✅ Sim | Nome completo do estande | `Estande Samsung` |
| **Número de Credenciais** | ✅ Sim | Limite de cadastros faciais | `5` |
| **Código do Evento** | ❌ Não | Código do evento (padrão: MEGA-FEIRA-2025) | `MEGA-FEIRA-2025` |
| **Localização** | ❌ Não | Local físico do estande | `Pavilhão A - Setor 1` |
| **Descrição** | ❌ Não | Descrição adicional | `Estande da Samsung Electronics` |

#### Exemplo de Preenchimento:

```
Nome do Estande,Número de Credenciais,Código do Evento,Localização,Descrição
Estande Samsung,5,MEGA-FEIRA-2025,Pavilhão A - Setor 1,Estande da Samsung Electronics
Estande Apple,3,MEGA-FEIRA-2025,Pavilhão A - Setor 2,Estande da Apple Inc
Estande Microsoft,10,MEGA-FEIRA-2025,Pavilhão B - Setor 1,Estande da Microsoft Corporation
```

### Passo 4: Fazer Upload

1. No modal de importação, clique em **"Escolher arquivo"**
2. Selecione o arquivo Excel preenchido
3. Clique em **"Importar"**
4. Aguarde o processamento

### Passo 5: Verificar Resultados

Após a importação, você verá um resumo:

```
✅ Importação concluída: X criados, Y atualizados

Criados: 5
Atualizados: 2
Erros: 0
```

## ⚙️ Regras de Importação

### Criação de Estandes

- **Novos estandes** são criados automaticamente
- **Código do estande** é gerado automaticamente a partir do nome:
  - `"Estande Samsung"` → `ESTANDE_SAMSUNG`
  - Espaços são substituídos por `_`
  - Caracteres especiais são removidos
  - Tudo em MAIÚSCULAS

### Atualização de Estandes

- **Estandes existentes** são atualizados se o código já existir
- **Limite de credenciais** pode ser aumentado a qualquer momento
- **Limite NÃO pode ser reduzido** abaixo do número atual de cadastros

#### Exemplo de Erro:

```
Estande: Samsung
Limite atual: 10 credenciais
Cadastros existentes: 7 participantes
Novo limite desejado: 5 ❌ ERRO!

Mensagem: "Não é possível reduzir o limite para 5 pois já existem 7 participantes cadastrados"
```

## 📝 Formatos Aceitos

- ✅ **CSV** (`.csv`) - Recomendado
- ✅ **Excel** (`.xlsx`, `.xls`)

## 🔐 Segurança

- ✅ Requer token de autenticação de administrador
- ✅ Validação de dados antes da importação
- ✅ Não sobrescreve cadastros existentes acidentalmente

## 🐛 Tratamento de Erros

### Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| "Nome do estande não fornecido" | Coluna vazia | Preencha a coluna "Nome do Estande" |
| "Não é possível reduzir o limite" | Cadastros existentes > novo limite | Aumente o limite ou remova cadastros |
| "Arquivo Excel vazio" | Arquivo sem dados | Adicione pelo menos uma linha de dados |

### Log de Erros

- Erros são exibidos no console do navegador (F12)
- Cada erro mostra:
  - Número da linha no Excel
  - Nome do estande (se disponível)
  - Mensagem de erro específica

## 💡 Dicas

1. **Sempre use o modelo**: Garante que as colunas estejam no formato correto
2. **Teste com poucos dados**: Faça um teste com 2-3 estandes primeiro
3. **Backup antes de importar**: Exporte seus dados atuais antes de fazer importações grandes
4. **Verifique os nomes**: Nomes idênticos são considerados o mesmo estande
5. **Use números inteiros**: O campo "Número de Credenciais" deve ser um número inteiro positivo

## 🔄 Atualizações em Massa

Para atualizar limites de vários estandes:

1. Baixe o modelo
2. Preencha apenas os estandes que deseja atualizar
3. **Use o mesmo nome** do estande existente
4. Altere o "Número de Credenciais"
5. Importe o arquivo

## 📞 Suporte

Em caso de problemas:

1. Verifique o console do navegador (F12) para erros detalhados
2. Confira se o arquivo está no formato correto
3. Teste com o arquivo modelo original
4. Entre em contato com o suporte técnico

---

## 📊 Estrutura Técnica

### API Endpoint

```
POST /api/admin/import-stands
Authorization: Bearer {token}
Content-Type: multipart/form-data

Body:
- file: Excel/CSV file
```

### Resposta de Sucesso

```json
{
  "success": true,
  "message": "Importação concluída: 5 criados, 2 atualizados",
  "results": {
    "created": 5,
    "updated": 2,
    "errors": [],
    "total": 7
  }
}
```

### Resposta com Erros

```json
{
  "success": true,
  "message": "Importação concluída: 3 criados, 1 atualizados",
  "results": {
    "created": 3,
    "updated": 1,
    "errors": [
      {
        "row": 5,
        "standName": "Estande Samsung",
        "error": "Não é possível reduzir o limite para 3 pois já existem 5 participantes cadastrados"
      }
    ],
    "total": 5
  }
}
```

---

**Desenvolvido para facilitar a gestão de estandes na Mega Feira 2025** 🎉
