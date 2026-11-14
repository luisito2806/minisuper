# Quita el arranque automatico, el icono y la regla de firewall.
# NO borra la base de datos ni los respaldos.
#   powershell -ExecutionPolicy Bypass -File scripts\desinstalar-tienda.ps1
Stop-ScheduledTask -TaskName 'MiniSuper' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'MiniSuper' -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -like '*servidor.cmd*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*server.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mini Super.lnk') -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'Mini Super (Tailscale)' -ErrorAction SilentlyContinue
Write-Host 'Arranque automatico, icono y regla de firewall quitados. La base de datos y los respaldos siguen intactos.'
