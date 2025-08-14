@echo off
echo 📱 Sistema de Cadastro Facial Mobile - Mega Feira 2025
echo ==================================================
echo.

REM Verificar Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js não encontrado. Instale Node.js 18+ primeiro.
    echo    Download: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js encontrado: 
node -v

REM Verificar npm
npm -v >nul 2>&1
if errorlevel 1 (
    echo ❌ npm não encontrado
    pause
    exit /b 1
)

echo ✅ npm encontrado:
npm -v

echo.
echo 📦 Instalando dependências...
call npm install

REM Configurar ambiente
if not exist ".env.local" (
    echo.
    echo ⚙️ Configurando ambiente...
    copy .env.example .env.local
    
    echo 📝 Configure o arquivo .env.local com:
    echo    - DATABASE_URL (NEON PostgreSQL)
    echo    - DIRECT_URL (NEON Direct)
    echo    - MASTER_KEY (32 caracteres)
    echo.
)

echo 🗄️ Configurando banco de dados...
call npx prisma generate

echo.
echo 🎉 Setup concluído!
echo.
echo 📋 Próximos passos:
echo.
echo 1. 📝 Configure .env.local:
echo    - DATABASE_URL (NEON PostgreSQL)
echo    - DIRECT_URL (NEON Direct connection)
echo.
echo 2. 🗄️ Aplicar schema do banco:
echo    npx prisma db push
echo.
echo 3. 🚀 Iniciar desenvolvimento:
echo    npm run dev
echo.
echo 4. 📱 Acessar no navegador:
echo    https://localhost:3000
echo.

set /p START="🚀 Deseja iniciar o servidor de desenvolvimento agora? (y/N): "
if /i "%START%"=="y" (
    echo 🌐 Iniciando servidor...
    echo    Pressione Ctrl+C para parar
    echo.
    npm run dev
) else (
    echo.
    echo 💡 Para iniciar quando estiver pronto:
    echo    npm run dev
    echo.
)

echo 📚 Documentação completa: README.md
echo 🔧 Guia de deploy: DEPLOY.md
echo 📞 Suporte: GitHub Issues
echo.
echo Boa sorte com o projeto! 🎪✨
pause