@echo off
chcp 65001 >nul
title Instalar Pecantojos (MongoDB Atlas)
cd /d "%~dp0"
echo.
echo  ===== Instalacion de Pecantojos sobre MongoDB Atlas =====
echo.
where node >nul 2>nul || (echo  [X] No se encontro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo. & pause & exit /b 1)
set "CFG=.env"
if exist "CONFIGURAR-AQUI.txt" set "CFG=CONFIGURAR-AQUI.txt"
if not exist "%CFG%" (echo  [X] Falta el archivo CONFIGURAR-AQUI.txt o .env en esta carpeta. & pause & exit /b 1)
findstr /c:"<contrasena>" "%CFG%" >nul && (echo  [X] Abre %CFG% con el Bloc de notas y reemplaza ^<contrasena^> por la contrasena del usuario pecantojos_app de Atlas. & pause & exit /b 1)
findstr /r /c:"^ADMIN_PASSWORD=........" "%CFG%" >nul || (echo  [X] En %CFG% escribe ADMIN_PASSWORD= con una contrasena de al menos 8 caracteres para el panel. & pause & exit /b 1)
rem El archivo con las contrasenas pasa a llamarse .env, que Git ignora
if /i "%CFG%"=="CONFIGURAR-AQUI.txt" (move /y "CONFIGURAR-AQUI.txt" ".env" >nul & echo  Configuracion guardada en .env)
echo  [1/3] Instalando dependencias (npm install)...
call npm install --no-fund --no-audit || (echo  [X] Fallo npm install. & pause & exit /b 1)
echo.
echo  [2/3] Probando la conexion con MongoDB Atlas...
call npm run mongo:check || (echo. & echo  [X] No hubo conexion. Revisa la contrasena en el .env y que Atlas tenga 0.0.0.0/0 en Network Access. & pause & exit /b 1)
echo.
echo  [3/3] Cargando los datos (catalogo + 12 meses de historico)...
call npm run mongo:cargar
if errorlevel 1 (
  echo.
  echo  Si dice que la base ya tiene datos y quieres cargarla de nuevo desde cero, ejecuta:
  echo     npm run mongo:cargar -- --reiniciar
  pause & exit /b 1
)
echo.
echo  ===== Listo. Para abrir la tienda usa Iniciar-Pecantojos.bat =====
pause
