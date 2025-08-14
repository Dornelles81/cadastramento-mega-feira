@echo off
color 0A
cls
echo.
echo ========================================
echo    🚀 MEGA FEIRA AUTO-DEPLOY
echo ========================================
echo.
echo Este script irá:
echo 1. Abrir GitHub para criar repositório
echo 2. Abrir NEON para criar banco
echo 3. Abrir Vercel para fazer deploy
echo.
echo Pressione qualquer tecla para continuar...
pause > nul

echo.
echo ========================================
echo PASSO 1: CRIANDO REPOSITÓRIO GITHUB
echo ========================================
echo.
echo Abrindo GitHub...
start "" "https://github.com/new"
echo.
echo Configure assim:
echo - Repository name: mega-feira-facial
echo - Description: Sistema de Reconhecimento Facial - Mega Feira 2025
echo - Public
echo - NÃO marque nenhuma opção
echo - Clique "Create repository"
echo.
echo Após criar, COPIE a URL do repositório criado
echo Exemplo: https://github.com/SEU-USUARIO/mega-feira-facial.git
echo.
set /p REPO_URL="Cole a URL do repositório aqui: "

echo.
echo Conectando com o repositório...
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

echo.
echo ✅ Código enviado para GitHub!
echo.
echo ========================================
echo PASSO 2: CONFIGURANDO BANCO NEON
echo ========================================
echo.
echo Abrindo NEON...
start "" "https://neon.tech"
echo.
echo Configure assim:
echo 1. Sign up/Login
echo 2. Create Project: mega-feira-db
echo 3. Aguarde provisionamento
echo 4. Clique "Connect"
echo 5. COPIE a connection string
echo.
set /p DB_URL="Cole a connection string aqui: "

echo.
echo ✅ Banco configurado!
echo.
echo ========================================
echo PASSO 3: DEPLOY NA VERCEL
echo ========================================
echo.
echo Abrindo Vercel...
start "" "https://vercel.com"
echo.
echo Configure assim:
echo 1. Login com GitHub
echo 2. New Project
echo 3. Import: mega-feira-facial
echo 4. Environment Variables:
echo.
echo DATABASE_URL=%DB_URL%
echo DIRECT_DATABASE_URL=%DB_URL%
echo MASTER_KEY=MinhaChaveSecreteaDe32CaracteresAqui
echo NEXTAUTH_SECRET=OutraChaveSuperSecretaProdução2025
echo.
echo 5. Deploy!
echo.
echo ========================================
echo ✅ DEPLOY COMPLETO!
echo ========================================
echo.
echo Sua aplicação estará disponível em:
echo https://mega-feira-facial-[ID].vercel.app
echo.
echo Para testar:
echo - Acesse a URL principal
echo - Admin: /admin (senha: admin123)
echo - API: /api/health
echo.
pause