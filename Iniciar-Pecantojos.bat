@echo off
chcp 65001 >nul
title Pecantojos
cd /d "%~dp0"
echo Pecantojos se esta iniciando. No cierres esta ventana mientras uses la tienda.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
npm start
pause
