#!/bin/bash

# 🚀 Start Script - Facial Capture Mobile
# Este script configura e inicia o projeto

set -e

echo "📱 Sistema de Cadastro Facial Mobile - Mega Feira 2025"
echo "=================================================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale Node.js 18+ primeiro."
    echo "   Download: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js versão 18+ necessária. Versão atual: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) encontrado"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado"
    exit 1
fi

echo "✅ npm $(npm -v) encontrado"

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install

# Verificar arquivo .env
if [ ! -f ".env.local" ]; then
    echo ""
    echo "⚙️  Configurando ambiente..."
    cp .env.example .env.local
    
    echo "📝 Configure o arquivo .env.local com:"
    echo "   - DATABASE_URL (NEON PostgreSQL)"
    echo "   - DIRECT_URL (NEON Direct)"
    echo "   - MASTER_KEY (32 caracteres)"
    echo ""
    
    # Gerar chave master automática
    MASTER_KEY=$(openssl rand -hex 16 2>/dev/null || echo "sua-chave-de-32-caracteres-aqui")
    sed -i.bak "s/your-32-character-encryption-key-here/$MASTER_KEY/" .env.local
    rm -f .env.local.bak
    
    echo "🔐 Chave de criptografia gerada: $MASTER_KEY"
    echo "   (Configure DATABASE_URL manualmente)"
    echo ""
fi

# Verificar Prisma
echo "🗄️  Configurando banco de dados..."
if [ -n "$DATABASE_URL" ] || grep -q "postgresql://" .env.local 2>/dev/null; then
    npx prisma generate
    echo "✅ Prisma client gerado"
    
    # Tentar aplicar schema se DATABASE_URL estiver configurado
    if npx prisma db push --preview-feature 2>/dev/null; then
        echo "✅ Schema aplicado ao banco"
    else
        echo "⚠️  Configure DATABASE_URL no .env.local e execute:"
        echo "   npx prisma db push"
    fi
else
    npx prisma generate
    echo "⚠️  Configure DATABASE_URL no .env.local"
fi

# Criar diretórios necessários
mkdir -p public/icons public/screenshots

echo ""
echo "🎉 Setup concluído!"
echo ""
echo "📋 Próximos passos:"
echo ""
echo "1. 📝 Configure .env.local:"
echo "   - DATABASE_URL (NEON PostgreSQL)"
echo "   - DIRECT_URL (NEON Direct connection)"
echo ""
echo "2. 🗄️  Aplicar schema do banco:"
echo "   npx prisma db push"
echo ""
echo "3. 🚀 Iniciar desenvolvimento:"
echo "   npm run dev"
echo ""
echo "4. 📱 Acessar no navegador:"
echo "   https://localhost:3000"
echo ""
echo "5. 🔧 Para deploy:"
echo "   - Siga DEPLOY.md"
echo "   - Use Vercel + NEON"
echo ""

# Verificar se deve iniciar automaticamente
read -p "🚀 Deseja iniciar o servidor de desenvolvimento agora? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌐 Iniciando servidor..."
    echo "   Pressione Ctrl+C para parar"
    echo ""
    npm run dev
else
    echo ""
    echo "💡 Para iniciar quando estiver pronto:"
    echo "   npm run dev"
    echo ""
fi

echo "📚 Documentação completa: README.md"
echo "🔧 Guia de deploy: DEPLOY.md"
echo "📞 Suporte: GitHub Issues"
echo ""
echo "Boa sorte com o projeto! 🎪✨"