# _stop_service_elevated.ps1 -- stop-only, so the published .exe file lock
# releases and we can dotnet publish over it. Does NOT remove the SCM
# registration; that happens in the combined sign+reinstall pass.
$ErrorActionPreference = 'Continue'
$LOGDIR = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs'
$MARKER = Join-Path $LOGDIR 'stop_service.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
sc.exe stop UNI-HUD 2>&1 | Out-Null
Start-Sleep 2
$svc = Get-Service -Name UNI-HUD -ErrorAction SilentlyContinue
"$($svc.Status)" | Out-File $MARKER -Encoding utf8
