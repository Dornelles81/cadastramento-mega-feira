# 🗑️ Como Remover CNH e NR da Produção

## ✅ Já Removido Localmente

Os documentos **CNH** e **NR** já foram removidos do banco de dados local.

---

## 📝 Opções para Remover em Produção

### **Opção 1: Via Endpoint API (Recomendado)**

1. **Abra o navegador** e acesse sua conta Vercel
2. **Navegue até**:
   ```
   https://cadastramento-mega-feira-7h11b3dp9-dornelles81s-projects.vercel.app/api/admin/remove-unwanted-docs
   ```
3. **Use uma ferramenta** como Postman, Thunder Client ou navegador com extensão para fazer um **POST** para essa URL
4. **Ou use o console do navegador**:
   ```javascript
   fetch('/api/admin/remove-unwanted-docs', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```

---

### **Opção 2: Via Admin de Documentos**

1. **Acesse**:
   ```
   https://cadastramento-mega-feira-7h11b3dp9-dornelles81s-projects.vercel.app/admin/documents
   ```
2. **Para CNH**:
   - Clique no documento **CNH**
   - Desmarque **"Ativo"**
   - Salve

3. **Para NR**:
   - Clique no documento **NR**
   - Desmarque **"Ativo"**
   - Salve

4. **Ou delete completamente** (se houver opção de deletar no admin)

---

### **Opção 3: Via Console do Navegador (Mais Rápido)**

1. **Abra a aplicação** em produção
2. **Abra o DevTools** (F12)
3. **No Console**, execute:
   ```javascript
   fetch('/api/admin/remove-unwanted-docs', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' }
   })
   .then(response => response.json())
   .then(data => {
     console.log('✅ Resultado:', data)
     console.log(`📊 ${data.deletedCount} documento(s) removido(s)`)
     console.log('📋 Documentos restantes:', data.remainingDocuments)
   })
   .catch(error => console.error('❌ Erro:', error))
   ```

---

## 🔍 Verificar se Foi Removido

Após executar qualquer opção acima, verifique:

```javascript
// No console do navegador em produção:
fetch('/api/public/document-fields')
  .then(r => r.json())
  .then(data => {
    console.log('📄 Documentos ativos:', data.documents)
    console.log('✅ Total:', data.documents.length)
  })
```

**Resultado Esperado**: Apenas "Documento com CPF" deve aparecer (ou nenhum, se estiver inativo).

---

## 📱 Testar o Formulário

1. **Acesse o formulário público** em produção
2. **Preencha os dados pessoais**
3. **Verifique**: CNH e NR **NÃO devem aparecer**
4. **Deve aparecer apenas**: Documento com CPF (se ativo)

---

## 🎯 Status Atual

| Item | Local | Produção |
|------|-------|----------|
| **Script criado** | ✅ | ✅ |
| **CNH removido** | ✅ | ⏳ Aguardando |
| **NR removido** | ✅ | ⏳ Aguardando |
| **Deploy feito** | ✅ | ✅ |

---

## 📞 Suporte

Se precisar de ajuda, verifique:
- **Endpoint de debug**: `/api/admin/debug-documents`
- **Admin de documentos**: `/admin/documents`
