@echo off
echo ====================================
echo   Deploy Mega Feira para Vercel
echo ====================================
echo.

echo Fazendo build do projeto...
call npm run build

echo.
echo Fazendo deploy para Vercel...
echo Use o nome do projeto: megafeira2025
echo.
vercel --prod

echo.
echo ====================================
echo Deploy concluido!
echo Acesse o link fornecido pelo Vercel
echo ====================================
pause