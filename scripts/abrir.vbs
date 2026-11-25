' Abre el Mini Super (lo usa el icono del escritorio).
' Espera a que el servidor responda (al encender la computadora tarda unos
' segundos) y lo abre en Edge como ventana propia, sin barras del navegador.
'   wscript abrir.vbs            normal
'   wscript abrir.vbs /directa   el ticket se imprime sin mostrar el cuadro de impresion
Option Explicit
Const URL = "http://localhost:3000/"
Const ESPERA_MAXIMA = 120 ' segundos

Dim shell, listo, i
Set shell = CreateObject("WScript.Shell")

Function Responde()
    Dim http
    Responde = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 2000, 2000, 2000, 2000
    http.open "GET", URL & "api/config", False
    http.send
    If Err.Number = 0 Then
        If http.status = 200 Then Responde = True
    End If
    Err.Clear
    On Error GoTo 0
End Function

listo = Responde()
For i = 1 To ESPERA_MAXIMA
    If listo Then Exit For
    WScript.Sleep 1000
    listo = Responde()
Next

If Not listo Then
    MsgBox "El Mini Super todavia no arranca." & vbCrLf & vbCrLf & _
        "Espera un minuto y vuelve a abrirlo. Si sigue sin abrir, reinicia la computadora." & vbCrLf & _
        "El registro de errores esta en C:\ProgramData\MiniSuper\logs\servidor.log", vbExclamation, "Mini Super"
    WScript.Quit 1
End If

' Edge en modo aplicacion, con su propio perfil (asi las opciones aplican
' aunque el navegador normal este abierto). Si no hay Edge, el navegador predeterminado.
Dim edge, perfil, argumentos
On Error Resume Next
edge = shell.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe\")
On Error GoTo 0
If edge = "" Then
    shell.Run URL
Else
    perfil = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MiniSuper\edge"
    argumentos = " --app=" & URL & " --user-data-dir=""" & perfil & """ --no-first-run"
    If WScript.Arguments.Count > 0 Then
        If LCase(WScript.Arguments(0)) = "/directa" Then argumentos = argumentos & " --kiosk-printing"
    End If
    shell.Run """" & edge & """" & argumentos
End If
