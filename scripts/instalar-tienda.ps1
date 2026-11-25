# Instala el Mini Super en la computadora de la tienda (Windows 10/11).
#
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-tienda.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-tienda.ps1 -Tailscale
#
# Que hace:
#   1. Revisa Node.js e instala las dependencias.
#   2. Crea el archivo .env si no existe (pide la contrasena de PostgreSQL).
#   3. Hace que el sistema arranque solo al iniciar sesion en Windows, oculto,
#      y que se reinicie si se cierra por un error.
#   4. Pone un icono "Mini Super" en el escritorio que abre la app como ventana.
#   -Tailscale (como administrador): permite entrar desde la ciudad por Tailscale
#      (solo desde la red de Tailscale) y evita que la computadora se suspenda.
#   -ImpresionDirecta: el ticket sale en la impresora predeterminada de Windows
#      sin mostrar el cuadro de impresion (pon la impresora de tickets como
#      predeterminada y su papel de 80 o 58 mm).
param([switch]$Tailscale, [switch]$ImpresionDirecta)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
Write-Host "Instalando Mini Super en $raiz" -ForegroundColor Cyan

# 1. Node.js
try {
    $version = (& node -v).TrimStart('v')
} catch {
    Write-Host 'No se encontro Node.js. Instala la version LTS desde https://nodejs.org y vuelve a correr este script.' -ForegroundColor Red
    exit 1
}
if ([int]($version.Split('.')[0]) -lt 20) {
    Write-Host "Node.js $version es muy viejo: se necesita la version 20 o mas nueva." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js $version OK"

# Si ya estaba instalado y corriendo (se vuelve a ejecutar para actualizar),
# se detiene: Windows no deja reemplazar archivos en uso, y al final se
# arranca una sola copia con el .env actual.
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -like '*servidor.cmd*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*server.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# npm ci instala exactamente las versiones de package-lock.json.
& npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host 'Fallo npm ci.' -ForegroundColor Red; exit 1 }

# 2. Archivo .env
$envFile = Join-Path $raiz '.env'
if (-not (Test-Path $envFile)) {
    $clave = Read-Host 'Contrasena del usuario postgres (la de pgAdmin)'
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secreto = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    @(
        'DB_HOST=localhost'
        'DB_PORT=5432'
        'DB_NAME=minisuper'
        'DB_USER=postgres'
        "DB_PASSWORD=$clave"
        "SESSION_SECRET=$secreto"
        'DATOS_DE_PRUEBA=false'
        'PORT=3000'
        '# 127.0.0.1 = solo esta computadora; 0.0.0.0 = tambien otras (Tailscale, red local)'
        'HOST=127.0.0.1'
        '# Para ver la tienda desde la ciudad (paso 3 de INSTALACION.md):'
        '# SYNC_URL=https://tu-nube.onrender.com'
        '# SYNC_TOKEN=clave-que-da-crear-tienda'
    ) | Set-Content -Path $envFile -Encoding ascii
    Write-Host '.env creado.'
} else {
    Write-Host '.env ya existe: no se modifica.'
}
New-Item -ItemType Directory -Force (Join-Path $raiz 'logs') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $raiz 'respaldos') | Out-Null

# 3. Arranque automatico (tarea programada al iniciar sesion, ventana oculta)
$vbs = Join-Path $raiz 'scripts\iniciar-oculto.vbs'
$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$disparador = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'MiniSuper' -Action $accion -Trigger $disparador -Settings $ajustes `
    -Description 'Servidor del Mini Super' -Force | Out-Null
Write-Host 'Arranque automatico configurado (tarea "MiniSuper").'

# 4. Icono en el escritorio (Edge en modo aplicacion, sin barras del navegador)
$escritorio = [Environment]::GetFolderPath('Desktop')
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
$shell = New-Object -ComObject WScript.Shell
$acceso = $shell.CreateShortcut((Join-Path $escritorio 'Mini Super.lnk'))
if ($edge) {
    $acceso.TargetPath = $edge
    # Perfil propio de Edge: asi las opciones aplican aunque el navegador normal este abierto.
    $perfil = Join-Path $env:LOCALAPPDATA 'MiniSuper\edge'
    $acceso.Arguments = "--app=http://localhost:3000 --user-data-dir=`"$perfil`""
    if ($ImpresionDirecta) { $acceso.Arguments += ' --kiosk-printing' }


} else {
    $acceso.TargetPath = 'http://localhost:3000'
}
$acceso.IconLocation = "$env:SystemRoot\System32\shell32.dll,12"
$acceso.Save()
Write-Host 'Icono "Mini Super" creado en el escritorio.'

# Opcional: acceso desde la ciudad por Tailscale
if ($Tailscale) {
    $esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $esAdmin) {
        Write-Host 'Para -Tailscale abre PowerShell como administrador.' -ForegroundColor Yellow
    } else {
        Remove-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -ErrorAction SilentlyContinue
        # Solo direcciones de Tailscale (100.64.0.0/10): nadie mas puede entrar.
        New-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -Direction Inbound -Protocol TCP -LocalPort 3000 `
            -RemoteAddress '100.64.0.0/10' -Action Allow | Out-Null
        # El servidor debe aceptar conexiones que no sean de esta computadora.
        $lineas = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*HOST\s*=' })
        Set-Content -Path $envFile -Value ($lineas + 'HOST=0.0.0.0') -Encoding ascii
        powercfg /change standby-timeout-ac 0
        powercfg /change hibernate-timeout-ac 0
        Write-Host 'Firewall: puerto 3000 abierto solo para Tailscale (HOST=0.0.0.0 en .env). Suspension desactivada con corriente.'
    }
}

Start-ScheduledTask -TaskName 'MiniSuper'
Write-Host ''
Write-Host 'Listo. El sistema ya esta corriendo y arrancara solo cada vez que se encienda la computadora.' -ForegroundColor Green
Write-Host 'Abre el icono "Mini Super" del escritorio. Si algo falla, revisa logs\servidor.log'
