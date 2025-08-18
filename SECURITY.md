# 🔐 Sistema de Segurança - Gerenciamento de Campos

## Visão Geral

O sistema de gerenciamento de campos personalizados (/admin/fields) está protegido por autenticação baseada em senha para garantir que apenas administradores autorizados possam modificar a estrutura dos formulários.

## Como Funciona

### 1. Autenticação
- **URL de Login**: `/admin/fields/login`
- **Senha Padrão**: `megafeira2025` (MUDE EM PRODUÇÃO!)
- **Duração da Sessão**: 24 horas
- **Armazenamento**: Token em sessionStorage do navegador

### 2. Fluxo de Acesso
1. Usuário acessa `/admin/fields`
2. Sistema verifica se há token válido
3. Se não houver, redireciona para `/admin/fields/login`
4. Após login bem-sucedido, token é gerado e armazenado
5. Todas as requisições à API de campos verificam o token

### 3. Proteção da API
- Endpoint: `/api/admin/fields`
- Verificação: Bearer token no header Authorization
- Métodos protegidos: GET, POST, PUT, DELETE

## Configuração

### Desenvolvimento
Por padrão, a senha é `megafeira2025`. Para testar:
1. Acesse http://localhost:3001/admin/fields/login
2. Digite a senha: `megafeira2025`
3. Clique em "Acessar"

### Produção

**IMPORTANTE**: Mude a senha padrão antes de colocar em produção!

1. **Configure as variáveis de ambiente**:
   ```env
   # .env.local ou .env.production
   ADMIN_PASSWORD=sua_senha_segura_aqui
   SECRET_KEY=uma_chave_secreta_longa_e_aleatoria
   ```

2. **Requisitos de Senha Segura**:
   - Mínimo 12 caracteres
   - Mistura de letras maiúsculas e minúsculas
   - Números e caracteres especiais
   - Única e não reutilizada

3. **Exemplo de senha forte**:
   ```
   MegaF3!ra@2025#Sec&re
   ```

## Recursos de Segurança

### ✅ Implementados
- Hash SHA-256 para senhas
- Tokens com validade temporal (24h)
- Verificação em todas as requisições à API
- Sessão baseada em sessionStorage (limpa ao fechar o navegador)
- Botão de logout para encerrar sessão

### 🔄 Recomendações Adicionais
- Use HTTPS em produção
- Implemente rate limiting para prevenir força bruta
- Configure CORS adequadamente
- Monitore tentativas de login falhadas
- Considere 2FA para ambientes críticos

## Gerenciamento de Acessos

### Para adicionar múltiplos administradores:
Atualmente o sistema suporta uma única senha compartilhada. Para múltiplos usuários, considere:
1. Implementar sistema de usuários com diferentes níveis
2. Usar serviço de autenticação externo (Auth0, Firebase Auth)
3. Integrar com Active Directory/LDAP corporativo

### Para revogar acesso:
1. Mude a senha no arquivo `.env.local`
2. Reinicie o servidor
3. Todos os tokens existentes serão invalidados

## Troubleshooting

### Problema: "Não autorizado" ao acessar campos
**Solução**: 
1. Verifique se fez login em `/admin/fields/login`
2. Limpe o sessionStorage e faça login novamente
3. Verifique se o token não expirou (24h)

### Problema: Senha não funciona
**Solução**:
1. Verifique o arquivo `.env.local`
2. Certifique-se que o servidor foi reiniciado após mudança
3. Use a senha padrão se não configurou variável de ambiente

### Problema: Perdeu a senha
**Solução**:
1. Acesse o servidor
2. Edite `.env.local` com nova senha
3. Reinicie o aplicativo

## Logs e Auditoria

Para ambiente de produção, considere implementar:
- Log de todas as tentativas de login
- Registro de mudanças nos campos
- Alertas para múltiplas tentativas falhadas
- Backup periódico da configuração de campos

## Contato e Suporte

Em caso de problemas de segurança:
1. Não exponha detalhes publicamente
2. Entre em contato com o administrador do sistema
3. Documente o incidente adequadamente

---

**⚠️ LEMBRETE IMPORTANTE**: 
Sempre mude a senha padrão antes de colocar o sistema em produção!