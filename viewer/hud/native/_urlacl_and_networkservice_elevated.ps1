# _urlacl_and_networkservice_elevated.ps1 -- the REAL fix for the LocalSystem
# overprivilege finding, not a rollback. Root cause of the earlier failure:
# HTTP.SYS requires an explicit URL ACL reservation for ANY non-admin account
# to LISTEN on an HttpListener prefix -- even a loopback-specific one like
# http://127.0.0.1:8100/. Administrators and LocalSystem get an implicit
# allowance; NetworkService does not. This script:
#   1. Reserves both prefixes HttpApiHost.cs actually registers, for
#      NT AUTHORITY\NetworkService, via netsh http add urlacl.
#   2. Reinstalls the service under NetworkService.
#   3. Starts it and verifies live (not "trust the exit code" -- actually
#      curls the health endpoint).
#   4. If it STILL fails, dumps diagnostic detail (netsh http show urlacl,
#      Get-WinEvent for the service failure) instead of silently rolling
#      back -- this run's job is to find out WHY if it doesn't work, not
#      to give up gracefully a second time.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
$LOG = Join-Path $LOGDIR 'urlacl_networkservice.log'
$MARKER = Join-Path $LOGDIR 'urlacl_networkservice.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File $LOG -Encoding utf8

function Test-Port8100 { [bool](Test-NetConnection 127.0.0.1 -Port 8100 -InformationLevel Quiet -WarningAction SilentlyContinue) }

try {
    $svcExe = Join-Path $ROOT 'viewer\hud\native\publish\service\UNI.Hud.Service.exe'

    # ---- 1. URL ACL reservations ----
    "== reserving URL ACLs for NT AUTHORITY\NetworkService ==" | Out-File -Append $LOG
    # Remove any stale reservation first (idempotency -- add fails loudly if one already exists with different ACL)
    netsh http delete urlacl url=http://127.0.0.1:8100/ 2>&1 | Out-File -Append $LOG
    netsh http delete urlacl url=http://localhost:8100/ 2>&1 | Out-File -Append $LOG
    netsh http add urlacl url=http://127.0.0.1:8100/ user="NT AUTHORITY\NetworkService" 2>&1 | Out-File -Append $LOG
    netsh http add urlacl url=http://localhost:8100/ user="NT AUTHORITY\NetworkService" 2>&1 | Out-File -Append $LOG
    "current urlacl reservations for :8100:" | Out-File -Append $LOG
    netsh http show urlacl | Select-String ':8100' -Context 0,3 | Out-File -Append $LOG

    # ---- 2. tear down + reinstall under NetworkService ----
    "== reinstalling UNI-HUD under NetworkService ==" | Out-File -Append $LOG
    sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 2
    sc.exe delete UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 1

    sc.exe create UNI-HUD binPath= "$svcExe" start= auto DisplayName= "UNI HUD (native)" obj= "NT AUTHORITY\NetworkService" 2>&1 | Out-File -Append $LOG
    sc.exe description UNI-HUD "UNI HUD backend service (native .NET ServiceBase, self-contained, code-signed). JSON-only API on 127.0.0.1:8100. Runs as NetworkService with an explicit URL ACL reservation (least-privilege)." 2>&1 | Out-File -Append $LOG

    $envValue = @("HUD_REPO_ROOT=$ROOT", "HUD_OPERATOR_HOME=C:\Users\mpolz")
    New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UNI-HUD' -Name 'Environment' -Value $envValue -PropertyType MultiString -Force | Out-File -Append $LOG
    sc.exe failure UNI-HUD reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG

    if (-not [System.Diagnostics.EventLog]::SourceExists('UNI-HUD')) { New-EventLog -LogName Application -Source 'UNI-HUD' }

    # Grant NetworkService read access to the repo (it needs to read evidence/gates.ndjson)
    "== granting NetworkService read access to the repo ==" | Out-File -Append $LOG
    $acl = Get-Acl $ROOT
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\NetworkService", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -Path $ROOT -AclObject $acl
    "granted ReadAndExecute on $ROOT to NetworkService" | Out-File -Append $LOG

    "== starting ==" | Out-File -Append $LOG
    sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
    Start-Sleep 4

    $svc = Get-Service -Name UNI-HUD
    $portUp = Test-Port8100
    "status=$($svc.Status) port_up=$portUp" | Out-File -Append $LOG

    if ($svc.Status -eq 'Running' -and $portUp) {
        # confirm it's actually answering with valid JSON, not just that the port is open
        try {
            $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8100/api/hud/health' -TimeoutSec 5 -UseBasicParsing
            $json = $resp.Content | ConvertFrom-Json
            "health check: ok=$($json.result.ok) instrument=$($json.envelope.instrument)" | Out-File -Append $LOG
            $genuinelyWorking = ($json.result.ok -eq $true)
        } catch {
            "health check FAILED: $($_.Exception.Message)" | Out-File -Append $LOG
            $genuinelyWorking = $false
        }
    } else {
        $genuinelyWorking = $false
        # DIAGNOSE instead of rolling back -- dump what actually went wrong
        "== service did not come up cleanly -- diagnosing (not rolling back yet) ==" | Out-File -Append $LOG
        sc.exe qc UNI-HUD 2>&1 | Out-File -Append $LOG
        try {
            $events = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Service Control Manager'} -MaxEvents 10 -ErrorAction SilentlyContinue |
                Where-Object { $_.Message -like '*UNI-HUD*' }
            foreach ($e in $events) { "$($e.TimeCreated) [$($e.LevelDisplayName)] $($e.Message)" | Out-File -Append $LOG }
        } catch { "could not read System event log: $($_.Exception.Message)" | Out-File -Append $LOG }
        try {
            $appEvents = Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='UNI-HUD'} -MaxEvents 10 -ErrorAction SilentlyContinue
            foreach ($e in $appEvents) { "$($e.TimeCreated) [$($e.LevelDisplayName)] $($e.Message)" | Out-File -Append $LOG }
        } catch { "could not read UNI-HUD application events: $($_.Exception.Message)" | Out-File -Append $LOG }
    }

    "genuinely_working_as_NetworkService: $genuinelyWorking" | Out-File -Append $LOG

    if (-not $genuinelyWorking) {
        # NOW roll back, but only after real diagnostics were captured above
        "== rolling back to LocalSystem (diagnostics captured above) ==" | Out-File -Append $LOG
        sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 2
        sc.exe delete UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 1
        sc.exe create UNI-HUD binPath= "$svcExe" start= auto DisplayName= "UNI HUD (native)" 2>&1 | Out-File -Append $LOG
        sc.exe description UNI-HUD "UNI HUD backend service (native .NET ServiceBase, self-contained, code-signed). LocalSystem -- NetworkService attempt with URL ACL still failed, see logs/urlacl_networkservice.log for diagnostics." 2>&1 | Out-File -Append $LOG
        New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\UNI-HUD' -Name 'Environment' -Value $envValue -PropertyType MultiString -Force | Out-File -Append $LOG
        sc.exe failure UNI-HUD reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG
        sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
        Start-Sleep 4
        $svc = Get-Service -Name UNI-HUD
        $portUp = Test-Port8100
        $usedAccount = "LocalSystem (rollback -- NetworkService failed even with URL ACL, see diagnostics)"
    } else {
        $usedAccount = "NetworkService (URL ACL reservation) -- GENUINE least-privilege fix"
    }

    "final account: $usedAccount" | Out-File -Append $LOG
    if ($svc.Status -eq 'Running' -and $portUp) { $exit = 0 } else { $exit = 1 }
} catch {
    "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG
    "$($_.ScriptStackTrace)" | Out-File -Append $LOG
    $exit = 99
}
"---- END exit=$exit ----" | Out-File -Append $LOG
$exit | Out-File $MARKER -Encoding utf8
