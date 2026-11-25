; Instalador del Mini Súper (Inno Setup 6). No se compila a mano: usa
;   powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1
; que arma el paquete en %TEMP%\MiniSuper-paquete y llama a este script.
; El .exe queda en instalador\salida.
;
; Lo que hace en la computadora de la tienda (sin internet):
;   - Copia el programa a C:\Program Files\MiniSuper (Node, PostgreSQL y la app).
;   - Ejecuta configurar-equipo.js: crea la base en C:\ProgramData\MiniSuper,
;     el servicio de PostgreSQL y la tarea que arranca el servidor al encender.
;   - Pone el icono "Mini Súper" en el escritorio.
; Actualizar = ejecutar un instalador más nuevo: los datos se conservan.
; Desinstalar quita el programa y los servicios, pero NO los datos.

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Paquete
  #define Paquete GetEnv("TEMP") + "\MiniSuper-paquete"
#endif

[Setup]
AppId={{041AAE6F-A1F0-47ED-8AF5-0878C5C69E03}
AppName=Mini Súper
AppVersion={#Version}
AppVerName=Mini Súper {#Version}
AppPublisher=Mini Súper
DefaultDirName={autopf}\MiniSuper
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=salida
OutputBaseFilename=MiniSuper-Setup-{#Version}
; lzma2/max: casi el mismo tamaño que ultra64 y compila varias veces más rápido.
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Mini Súper
UninstallDisplayIcon={sys}\shell32.dll,12
; Los servicios se detienen en PrepareToInstall; no hace falta el Administrador de reinicio.
CloseApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "directa"; Description: "Imprimir el ticket directo en la impresora predeterminada (sin cuadro de impresión)"; Flags: unchecked
Name: "tailscale"; Description: "Permitir entrar desde la ciudad con Tailscale (ver INSTALACION.md)"; Flags: unchecked

[Files]
Source: "{#Paquete}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autodesktop}\Mini Súper"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\abrir.vbs"" {code:ArgumentoImpresion}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 12; Comment: "Abrir el Mini Súper"
Name: "{autoprograms}\Mini Súper"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\abrir.vbs"" {code:ArgumentoImpresion}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 12; Comment: "Abrir el Mini Súper"
Name: "{autoprograms}\Carpeta de datos del Mini Súper"; Filename: "{commonappdata}\MiniSuper"; Comment: "Respaldos y registro de errores"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\abrir.vbs"" {code:ArgumentoImpresion}"; Description: "Abrir el Mini Súper"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\node\node.exe"; Parameters: """{app}\app\scripts\configurar-equipo.js"" --quitar --programa ""{app}"" --datos ""{commonappdata}\MiniSuper"""; Flags: runhidden waituntilterminated; RunOnceId: "QuitarServicios"

[Code]
function ArgumentoImpresion(Valor: String): String;
begin
  if WizardIsTaskSelected('directa') then Result := '/directa' else Result := '';
end;

function Configurador(): String;
begin
  Result := ExpandConstant('"{app}\app\scripts\configurar-equipo.js" --programa "{app}" --datos "{commonappdata}\MiniSuper"');
end;

{ Actualización: detener el servidor y PostgreSQL antes de reemplazar archivos. }
function PrepareToInstall(var NecesitaReiniciar: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\node\node.exe')) and FileExists(ExpandConstant('{app}\app\scripts\configurar-equipo.js')) then
    Exec(ExpandConstant('{app}\node\node.exe'), Configurador() + ' --detener', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

{ Después de copiar: crear o actualizar la base, los servicios y el .env. }
procedure CurStepChanged(Paso: TSetupStep);
var
  Codigo: Integer;
  Extra: String;
begin
  if Paso = ssPostInstall then
  begin
    Extra := '';
    if WizardIsTaskSelected('tailscale') then Extra := ' --tailscale';
    WizardForm.StatusLabel.Caption := 'Preparando la base de datos (puede tardar un minuto)…';
    if not Exec(ExpandConstant('{app}\node\node.exe'), Configurador() + Extra, '', SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
      { SuppressibleMsgBox: en modo silencioso (/SUPPRESSMSGBOXES) no detiene la instalación. }
      SuppressibleMsgBox('No se pudo preparar la base de datos.' + #13#10 + #13#10 +
        'Revisa el archivo ' + ExpandConstant('{commonappdata}\MiniSuper\logs\instalacion.log') +
        ' y vuelve a ejecutar el instalador. Los datos que ya existían no se borraron.', mbError, MB_OK, IDOK);
  end;
end;
