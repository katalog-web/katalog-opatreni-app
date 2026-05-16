@echo off
TITLE Katalog Opatreni - Nasazeni
cd /d %~dp0


echo ========================================
echo NAHRANI KATALOGU NA ZIVY WEB (katalog.afres.cz)
echo ========================================
echo.
echo Krok 1: Prihlaseni do Firebase...
call npx firebase login
echo.
echo Krok 2: Vytvarim balicek k odeslani...
call npm run build
echo.
echo Krok 3: Odesilam na zivy web...
call npx firebase deploy
echo.
echo HOTOVO!
pause
