@echo off
rem Mantiene el servidor del Mini Super corriendo: si se cierra por un error
rem (por ejemplo, PostgreSQL todavia no arranca), lo vuelve a iniciar.
rem
rem   servidor.cmd                            datos (.env, logs, respaldos) en la carpeta del proyecto
rem   servidor.cmd "C:\ProgramData\MiniSuper" instalado con MiniSuper-Setup.exe
setlocal
cd /d "%~dp0.."
if not "%~1"=="" set "MINISUPER_DATOS=%~1"
if defined MINISUPER_DATOS (set "LOGS=%MINISUPER_DATOS%\logs") else (set "LOGS=%CD%\logs")
rem Node incluido en el instalador; si no existe, el que este instalado en Windows.
set "NODO=node"
if exist "%~dp0..\..\node\node.exe" set "NODO=%~dp0..\..\node\node.exe"
if not exist "%LOGS%" mkdir "%LOGS%"

:inicio
rem El registro se rota al pasar de 5 MB para no llenar el disco.
if exist "%LOGS%\servidor.log" for %%A in ("%LOGS%\servidor.log") do if %%~zA GTR 5000000 move /y "%LOGS%\servidor.log" "%LOGS%\servidor.anterior.log" > nul
echo [%date% %time%] Iniciando servidor >> "%LOGS%\servidor.log"
"%NODO%" server.js >> "%LOGS%\servidor.log" 2>&1
echo [%date% %time%] El servidor se detuvo; reintento en 10 segundos >> "%LOGS%\servidor.log"
rem ping en lugar de timeout: funciona tambien sin ventana (tarea de Windows).
ping -n 11 127.0.0.1 > nul
goto inicio
