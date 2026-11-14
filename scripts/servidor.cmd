@echo off
rem Mantiene el servidor del Mini Super corriendo: si se cierra por un error
rem (por ejemplo, PostgreSQL todavia no arranca), lo vuelve a iniciar.
cd /d "%~dp0.."
if not exist logs mkdir logs
:inicio
echo [%date% %time%] Iniciando servidor >> logs\servidor.log
node server.js >> logs\servidor.log 2>&1
echo [%date% %time%] El servidor se detuvo; reintento en 10 segundos >> logs\servidor.log
timeout /t 10 /nobreak > nul
goto inicio
