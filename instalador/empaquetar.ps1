# Arma el instalador del Mini Super (se ejecuta en TU computadora, no en la tienda).
#
#   powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
#   powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1 -PgDir "C:\Program Files\PostgreSQL\18"
#
# Toma Node.js y PostgreSQL de los que ya tienes instalados (no descarga nada),
# copia la aplicacion con sus dependencias y, si tienes Inno Setup 6, genera
#   instalador\salida\MiniSuper-Setup-<version>.exe
# Ese .exe es lo unico que se lleva a la tienda (por ejemplo, en una USB).
#
# Requisitos en esta computadora: Node.js 20+, PostgreSQL (la misma version
# principal que tendra la tienda) e Inno Setup 6:  winget install JRSoftware.InnoSetup
param([string]$PgDir)

$ErrorActionPreference = 'Stop'
$instalador = $PSScriptRoot
$raiz = Split-Path -Parent $instalador
$salida = Join-Path $instalador 'salida'   # aqui queda solo el .exe
# El paquete (~250 MB) se arma fuera del proyecto, para que OneDrive no lo suba.
$paquete = Join-Path $env:TEMP 'MiniSuper-paquete'

function Copiar([string]$origen, [string]$destino, [string[]]$sinArchivos = @(), [string[]]$sinCarpetas = @()) {
    $opciones = @('/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($sinArchivos.Count) { $opciones += '/XF'; $opciones += $sinArchivos }
    if ($sinCarpetas.Count) { $opciones += '/XD'; $opciones += $sinCarpetas }
    & robocopy $origen $destino @opciones | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "No se pudo copiar $origen" }
}

Write-Host 'Armando el paquete del Mini Super...' -ForegroundColor Cyan
if (Test-Path $paquete) { Remove-Item -Recurse -Force $paquete }
New-Item -ItemType Directory -Force $paquete | Out-Null

# 1. Node.js (un solo archivo, no necesita instalarse)
$node = (Get-Command node -ErrorAction Stop).Source
$versionNode = (& $node -v).TrimStart('v')
if ([int]$versionNode.Split('.')[0] -lt 20) { throw "Node.js $versionNode es muy viejo (se necesita 20+)." }
New-Item -ItemType Directory -Force (Join-Path $paquete 'node') | Out-Null
Copy-Item $node (Join-Path $paquete 'node\node.exe')
$licenciaNode = Join-Path (Split-Path $node) 'LICENSE'
if (Test-Path $licenciaNode) { Copy-Item $licenciaNode (Join-Path $paquete 'node\LICENSE') }
Write-Host "  Node.js $versionNode"

# 2. PostgreSQL: solo lo necesario para el servidor y los respaldos (sin pgAdmin,
#    StackBuilder, documentacion ni archivos de desarrollo).
if (-not $PgDir) {
    $PgDir = Get-ChildItem (Join-Path $env:ProgramFiles 'PostgreSQL') -Directory -ErrorAction Stop |
        Where-Object { Test-Path (Join-Path $_.FullName 'bin\postgres.exe') } |
        Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $PgDir -or -not (Test-Path (Join-Path $PgDir 'bin\postgres.exe'))) { throw 'No se encontro PostgreSQL. Indica la carpeta con -PgDir.' }
$pg = Join-Path $paquete 'pgsql'
Copiar (Join-Path $PgDir 'bin') (Join-Path $pg 'bin') @('wx*.dll', 'stackbuilder.exe', 'pgbench.exe', 'ecpg.exe', '*.lib', 'test_*.exe', 'testplug.dll')
Copiar (Join-Path $PgDir 'lib') (Join-Path $pg 'lib') @('*.lib', '*.a', '*.pdb') @('pgxs')
Copiar (Join-Path $PgDir 'share') (Join-Path $pg 'share') @() @('doc')
foreach ($licencia in 'server_license.txt', 'commandlinetools_3rd_party_licenses.txt') {
    if (Test-Path (Join-Path $PgDir $licencia)) { Copy-Item (Join-Path $PgDir $licencia) $pg }
}
# Bibliotecas de Visual C++ que PostgreSQL necesita: la computadora de la
# tienda puede no tenerlas, se ponen junto a sus programas.
foreach ($dll in 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'concrt140.dll') {
    $ruta = Join-Path $env:SystemRoot "System32\$dll"
    if (Test-Path $ruta) { Copy-Item $ruta (Join-Path $pg 'bin') }
}
$versionPg = (& (Join-Path $pg 'bin\postgres.exe') --version)
if ($LASTEXITCODE -ne 0) { throw 'El PostgreSQL copiado no arranca.' }
Write-Host "  $versionPg (de $PgDir)"

# 3. La aplicacion, con sus dependencias de produccion
$app = Join-Path $paquete 'app'
New-Item -ItemType Directory -Force $app | Out-Null
foreach ($archivo in 'server.js', 'package.json', 'package-lock.json') {
    Copy-Item (Join-Path $raiz $archivo) $app
}
foreach ($archivo in '.env.example', 'README.md', 'INSTALACION.md') {
    if (Test-Path (Join-Path $raiz $archivo)) { Copy-Item (Join-Path $raiz $archivo) $app }
}
Copiar (Join-Path $raiz 'src') (Join-Path $app 'src')
Copiar (Join-Path $raiz 'public') (Join-Path $app 'public')
New-Item -ItemType Directory -Force (Join-Path $app 'scripts') | Out-Null
Copy-Item (Join-Path $raiz 'scripts\configurar-equipo.js') (Join-Path $app 'scripts')
# cmd y wscript necesitan fin de linea CRLF: Set-Content lo garantiza aunque
# el archivo del proyecto haya quedado con LF.
foreach ($archivo in 'servidor.cmd', 'abrir.vbs') {
    Get-Content (Join-Path $raiz "scripts\$archivo") | Set-Content -Encoding ascii (Join-Path $app "scripts\$archivo")
}
Push-Location $app
try {
    # --prefer-offline: usa la cache de npm de esta computadora si ya tiene los paquetes.
    & npm ci --omit=dev --no-audit --no-fund --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw 'Fallo npm ci.' }
} finally {
    Pop-Location
}
$version = (Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json).version
$tamano = [math]::Round(((Get-ChildItem $paquete -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
Write-Host "  Aplicacion $version (paquete: $tamano MB sin comprimir)"

# 4. Instalador con Inno Setup
$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    Write-Host ''
    Write-Host "Paquete listo en $paquete, pero falta Inno Setup 6 para hacer el .exe." -ForegroundColor Yellow
    Write-Host 'Instalalo con:  winget install JRSoftware.InnoSetup   y vuelve a ejecutar este script.'
    exit 0
}
& $iscc "/DVersion=$version" "/DPaquete=$paquete" (Join-Path $instalador 'MiniSuper.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup no pudo crear el instalador.' }
Write-Host ''
Write-Host "Listo: $(Join-Path $salida "MiniSuper-Setup-$version.exe")" -ForegroundColor Green
Write-Host 'Copialo a una USB y ejecutalo en la computadora de la tienda (no necesita internet).'
