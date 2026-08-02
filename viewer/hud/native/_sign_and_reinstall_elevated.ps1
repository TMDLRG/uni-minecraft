# _sign_and_reinstall_elevated.ps1 -- combined elevated pass:
#   1. sign both freshly-published exes with the existing self-signed cert
#   2. tear down the current UNI-HUD SCM registration
#   3. attempt sc.exe create with obj=NT AUTHORITY\NetworkService (tighter than
#      LocalSystem, which the security review flagged as unjustified for a
#      service that only reads repo files and binds loopback HTTP)
#   4. start it, verify :8100 actually answers; if NetworkService cannot bind
#      HttpListener or the service fails to start, ROLL BACK to LocalSystem
#      automatically rather than leaving the HUD down.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
$LOG = Join-Path $LOGDIR 'sign_and_reinstall.log'
$MARKER = Join-Path $LOGDIR 'sign_and_reinstall.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File $LOG -Encoding utf8

function Test-Port8100 {
  [bool](Test-NetConnection 127.0.0.1 -Port 8100 -InformationLevel Quiet -WarningAction SilentlyContinue)
}

try {
    # ---- 1. sign ----
    $subject = "CN=UNI-HUD Local Signing (self-signed), O=solutionwright"
    $cert = Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $subject } | Select-Object -First 1
    if (-not $cert) { throw "signing cert not found -- run _cert_and_sign_elevated.ps1 first" }
    "using cert thumb=$($cert.Thumbprint)" | Out-File -Append $LOG

    $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $signtool) { throw "signtool.exe not found" }

    $svcExe = Join-Path $ROOT 'viewer\hud\native\publish\service\UNI.Hud.Service.exe'
    $widExe = Join-Path $ROOT 'viewer\hud\native\publish\widget\UNI.Hud.Widget.exe'
    foreach ($t in @($svcExe, $widExe)) {
        "signing $t" | Out-File -Append $LOG
        & $signtool.FullName sign /sm /sha1 $cert.Thumbprint /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com $t *>&1 | Out-File -Append $LOG
        $sig = Get-AuthenticodeSignature $t
        "  Status=$($sig.Status)" | Out-File -Append $LOG
        if ($sig.Status -ne 'Valid') { throw "signing failed for $t : $($sig.StatusMessage)" }
    }

    # ---- 2. tear down current registration ----
    "== tearing down current UNI-HUD registration ==" | Out-File -Append $LOG
    sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 2
    sc.exe delete UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 1

    # ---- 3. attempt NetworkService ----
    "== attempting obj=NT AUTHORITY\NetworkService ==" | Out-File -Append $LOG
    sc.exe create UNI-HUD binPath= "$svcExe" start= auto DisplayName= "UNI HUD (native)" obj= "NT AUTHORITY\NetworkService" 2>&1 | Out-File -Append $LOG
    sc.exe description UNI-HUD "UNI HUD backend service (native .NET ServiceBase, self-contained, code-signed). JSON-only API on 127.0.0.1:8100. Runs as NetworkService (least-privilege; LocalSystem was unjustified for a read-only loopback-bound service)." 2>&1 | Out-File -Append $LOG

    $envValue = @("HUD_REPO_ROOT=$ROOT", "HUD_OPERATOR_HOME=C:\Users\mpolz")
    New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UNI-HUD' -Name 'Environment' -Value $envValue -PropertyType MultiString -Force | Out-File -Append $LOG
    sc.exe failure UNI-HUD reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG

    if (-not [System.Diagnostics.EventLog]::SourceExists('UNI-HUD')) { New-EventLog -LogName Application -Source 'UNI-HUD' }

    sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 4
    $svc = Get-Service -Name UNI-HUD
    $portUp = Test-Port8100
    "NetworkService attempt: Status=$($svc.Status) port_up=$portUp" | Out-File -Append $LOG

    $usedAccount = "NetworkService"
    if ($svc.Status -ne 'Running' -or -not $portUp) {
        # ---- ROLLBACK to LocalSystem ----
        "== NetworkService attempt failed -- rolling back to LocalSystem ==" | Out-File -Append $LOG
        sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 2
        sc.exe delete UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 1
        sc.exe create UNI-HUD binPath= "$svcExe" start= auto DisplayName= "UNI HUD (native)" 2>&1 | Out-File -Append $LOG
        sc.exe description UNI-HUD "UNI HUD backend service (native .NET ServiceBase, self-contained, code-signed). JSON-only API on 127.0.0.1:8100. NOTE: attempted NetworkService for least-privilege but it could not bind/start reliably; running as LocalSystem (default) -- see logs/sign_and_reinstall.log for the attempt record." 2>&1 | Out-File -Append $LOG
        New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UNI-HUD' -Name 'Environment' -Value $envValue -PropertyType MultiString -Force | Out-File -Append $LOG
        sc.exe failure UNI-HUD reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG
        sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 4
        $svc = Get-Service -Name UNI-HUD
        $portUp = Test-Port8100
        $usedAccount = "LocalSystem (rollback)"
        "LocalSystem rollback: Status=$($svc.Status) port_up=$portUp" | Out-File -Append $LOG
    }

    "final account: $usedAccount" | Out-File -Append $LOG
    if ($svc.Status -eq 'Running' -and $portUp) { $exit = 0 } else { $exit = 1 }
} catch {
    "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG
    $exit = 99
}
"---- END exit=$exit ----" | Out-File -Append $LOG
$exit | Out-File $MARKER -Encoding utf8
