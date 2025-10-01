@echo off
echo ====================================
echo   Deploy Mega Feira para Vercel
echo ====================================
echo.

echo Iniciando deploy...
echo.
echo Quando solicitado:
echo 1. Set up and deploy: Y
echo 2. Which scope: Selecione seu usuario
echo 3. Link to existing project? N
echo 4. Project name: megafeira2025
echo 5. In which directory: ./ (pressione Enter)
echo 6. Want to override settings? N
echo.

vercel

echo.
echo ====================================
echo Para deploy em producao, execute:
echo vercel --prod
echo ====================================
pause