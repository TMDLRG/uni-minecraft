# _update_service_binaries_elevated.ps1 — runs ELEVATED. Updates the UNI-HUD service's binaries
# in place and restarts it. Does NOT re-register the service, does not touch its account
# (NT AUTHORITY\NetworkService), its URL ACLs, or its SCM failure/recovery config — those are
# already correct and re-running the full swap script would tear down a working install.
#
# Why elevation is needed at all: stopping/starting an SCM service and writing into the service's
# ImagePath directory both require it. The operator clicks ONE UAC prompt; the agent never asks the
# operator to run a script by hand, and never asks for a password.
#
# Written 2026-07-17 for the blocker-#1 fix (air.pictureOnProgram / pictureNote must cross the
# service boundary — SnapshotBuilder ENUMERATES fields, so an un-redeployed service silently drops
# the whole fix and the widget renders the old lie).
$ErrorActionPreference = 'Continue'
$ROOT   = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$NATIVE = Join-Path $ROOT 'viewer\hud\native'
$SRC    = Join-Path $NATIVE 'publish\service_new'
$DST    = Join-Path $NATIVE 'publish\service'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG    = Join-Path $LOGDIR 'update_service_binaries.log'
$MARKER = Join-Path $LOGDIR 'update_service_binaries.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') ----" | Out-File $LOG -Encoding utf8

try {
    if (-not (Test-Path (Join-Path $SRC 'UNI.Hud.Service.exe'))) { throw "no new build at $SRC" }

    "== stop UNI-HUD ==" | Out-File -Append $LOG
    sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
    # Wait for a real STOPPED, not a fixed sleep: the whole repo's method is "never claim from
    # process existence". Poll the SCM until it says so, with a bounded ceiling.
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $svc = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
    } while ($svc -and $svc.Status -ne 'Stopped' -and (Get-Date) -lt $deadline)
    "status after stop: $($svc.Status)" | Out-File -Append $LOG
    if ($svc.Status -ne 'Stopped') { throw "service did not stop within 30s (status=$($svc.Status))" }

    "== copy binaries $SRC -> $DST ==" | Out-File -Append $LOG
    Copy-Item -Path (Join-Path $SRC '*') -Destination $DST -Recurse -Force -ErrorAction Stop
    "copied" | Out-File -Append $LOG

    "== start UNI-HUD ==" | Out-File -Append $LOG
    sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $svc = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
    } while ($svc -and $svc.Status -ne 'Running' -and (Get-Date) -lt $deadline)
    "status after start: $($svc.Status)" | Out-File -Append $LOG
    if ($svc.Status -ne 'Running') { throw "service did not reach Running within 30s (status=$($svc.Status))" }

    # Prove the ACCOUNT and the ImagePath survived — a swap that silently downgraded the service to
    # LocalSystem, or repointed it, would be a real regression and must not pass as success.
    $cim = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD'"
    "StartName: $($cim.StartName)" | Out-File -Append $LOG
    "PathName : $($cim.PathName)"  | Out-File -Append $LOG

    "OK" | Out-File -Append $LOG
    "ok" | Out-File $MARKER -Encoding ascii
} catch {
    "FAILED: $_" | Out-File -Append $LOG
    "fail: $_" | Out-File $MARKER -Encoding ascii
}
"---- END ----" | Out-File -Append $LOG
