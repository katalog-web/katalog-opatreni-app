@echo off
TITLE Katalog Opatreni - Starting...
cd /d %~dp0
echo ========================================
echo SPUSTENI KATALOGU OPATRENI
echo ========================================
echo.
echo 1. Spoustim server (npm run dev)...
start /b cmd /c "npm.cmd run dev"
echo.
echo 2. Cekam na nabehnuti serveru...
timeout /t 5
echo.
echo 3. Spoustim tunel na internet...
echo NOVOU ADRESU NAJDETE NENIZE V TEXTU (Visit it at...)
echo.
npx.cmd cloudflared tunnel --url http://localhost:3000
pause
