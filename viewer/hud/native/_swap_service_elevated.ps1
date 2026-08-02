# _swap_service_elevated.ps1 — runs elevated. Uninstalls the Node-based
# UNI-HUD service (via nssm), then registers the .NET signed .exe as a real
# SCM service using sc.exe. The .exe implements ServiceBase natively (via
# Microsoft.Extensions.Hosting.WindowsServices) so NO wrapper is needed.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'swap_service.log'
$MARKER = Join-Path $LOGDIR 'swap_service.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File $LOG -Encoding utf8

try {
    "== step 1: remove existing UNI-HUD service ==" | Out-File -Append $LOG
    $nssm = 'C:\Users\mpolz\Documents\UNI.Minecraft\viewer\hud\build\nssm.exe'
    if (Test-Path $nssm) {
        & $nssm stop UNI-HUD confirm 2>&1 | Out-File -Append $LOG
        Start-Sleep 2
        & $nssm remove UNI-HUD confirm 2>&1 | Out-File -Append $LOG
    } else {
        & sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 2
        & sc.exe delete UNI-HUD 2>&1 | Out-File -Append $LOG
    }
    Start-Sleep 2

    "== step 2: sc create UNI-HUD (native ServiceBase, signed) ==" | Out-File -Append $LOG
    $exe = Join-Path $ROOT 'viewer\hud\native\publish\service\UNI.Hud.Service.exe'
    if (-not (Test-Path $exe)) { throw "service exe missing at $exe" }
    & sc.exe create UNI-HUD binPath= "$exe" start= auto DisplayName= "UNI HUD (native)" 2>&1 | Out-File -Append $LOG
    & sc.exe description UNI-HUD "UNI HUD backend service (native .NET ServiceBase, self-contained, code-signed). JSON-only API on 127.0.0.1:8100. See docs/HUD.md." 2>&1 | Out-File -Append $LOG

    $envValue = @("HUD_REPO_ROOT=$ROOT", "HUD_OPERATOR_HOME=C:\Users\mpolz")
    New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UNI-HUD' -Name 'Environment' -Value $envValue -PropertyType MultiString -Force | Out-File -Append $LOG

    & sc.exe failure UNI-HUD reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG
    Start-Sleep 1

    "== step 3: register UNI-HUD event source ==" | Out-File -Append $LOG
    if (-not [System.Diagnostics.EventLog]::SourceExists('UNI-HUD')) {
        New-EventLog -LogName Application -Source 'UNI-HUD'
        "created event source UNI-HUD" | Out-File -Append $LOG
    } else {
        "event source UNI-HUD already present" | Out-File -Append $LOG
    }

    "== step 4: start service ==" | Out-File -Append $LOG
    & sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 3
    $svc = Get-Service -Name UNI-HUD
    "Status: $($svc.Status)  StartType: $($svc.StartType)" | Out-File -Append $LOG
    $portUp = [bool](Test-NetConnection 127.0.0.1 -Port 8100 -InformationLevel Quiet -WarningAction SilentlyContinue)
    "port_8100_up: $portUp" | Out-File -Append $LOG

    if ($svc.Status -eq 'Running' -and $portUp) { $exit = 0 } else { $exit = 1 }
} catch {
    "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG
    $exit = 99
}
"---- END exit=$exit ----" | Out-File -Append $LOG
$exit | Out-File $MARKER -Encoding utf8
