' Arranca el servidor del Mini Super sin ventana (lo usa la tarea programada).
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & carpeta & "\servidor.cmd""", 0, False
