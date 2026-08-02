# door_boot_install.ps1 - install door_watchdog.ps1 as a per-user logon autostart (boot-persistence
# for THE DOOR). ASCII ONLY (PS 5.1). Mirrors the PROVEN gaia_boot_install.ps1 mechanism.
#
# Per-user, NON-ELEVATED: a hidden .vbs in the current user's Startup folder (no Task Scheduler /
# admin rights). Local, reversible (-Remove), touches no stream key, no go-live, nothing on the chip.
# Reboot-survival is PROVEN only by door_boot_proof.ps1 (the OS must boot AFTER the install marker
# AND the watchdog must start post-boot AND :8090 answer) - a manual start can never false-pass it.
#
#   powershell -File viewer\door_boot_install.ps1            # install the logon launcher
#   powershell -File viewer\door_boot_install.ps1 -Remove    # uninstall it
#   powershell -File viewer\door_boot_install.ps1 -Status    # show install state
param([switch]$Remove, [switch]$Status)
$ErrorActionPreference = 'Stop'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WD      = Join-Path $ROOT 'viewer\door_watchdog.ps1'
$OPEN    = Join-Path $ROOT 'viewer\door_boot_open.ps1'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-Door-Watchdog.vbs'
$LNK2    = Join-Path $STARTUP 'UNI-Door-AutoOpen.vbs'
$LOGDIR  = Join-Path $ROOT 'logs'
$MARKER  = Join-Path $LOGDIR 'door_boot_install.marker'

if ($Status) {
  "startup_launcher (watchdog)  : $LNK"
  "installed                    : $(Test-Path $LNK)"
  "startup_launcher (auto-open) : $LNK2"
  "installed                    : $(Test-Path $LNK2)"
  "install_marker                : $(if (Test-Path $MARKER) { (Get-Content $MARKER -Raw).Trim() } else { 'none' })"
  exit 0
}
if ($Remove) {
  if (Test-Path $LNK)    { Remove-Item $LNK -Force }
  if (Test-Path $LNK2)   { Remove-Item $LNK2 -Force }
  if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
  "uninstalled: watchdog present = $(Test-Path $LNK)  auto-open present = $(Test-Path $LNK2)"
  exit 0
}
if (-not (Test-Path $WD))   { throw "door_watchdog.ps1 not found at $WD" }
if (-not (Test-Path $OPEN)) { throw "door_boot_open.ps1 not found at $OPEN" }
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }

# Hidden .vbs launchers (window style 0 = no console flash at logon). VBS double-quote = Chr(34).
# TWO separate Startup entries by design: the watchdog LOOPS forever (supervises the server); the
# auto-open runs ONCE per logon and only ever opens a window -- it must never re-supervise or
# reopen a window the operator deliberately closed.
$vbs = @"
' UNI-Door-Watchdog - per-user logon autostart for the door supervisor (installed by door_boot_install.ps1).
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$WD" & q, 0, False
"@
Set-Content -Path $LNK -Value $vbs -Encoding ascii

$vbs2 = @"
' UNI-Door-AutoOpen - one-shot per-logon: waits for the door then opens it (installed by door_boot_install.ps1).
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$OPEN" & q, 0, False
"@
Set-Content -Path $LNK2 -Value $vbs2 -Encoding ascii

# Install marker: door_boot_proof.ps1 requires the OS to have booted AFTER this timestamp.
# (The gate concerns the WATCHDOG returning, not the cosmetic auto-open leg.)
Set-Content -Path $MARKER -Value (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') -Encoding ascii

if (-not (Test-Path $LNK))  { throw "install FAILED: watchdog launcher not present at $LNK" }
if (-not (Test-Path $LNK2)) { throw "install FAILED: auto-open launcher not present at $LNK2" }
"Installed logon launcher (watchdog)  : $LNK"
"Installed logon launcher (auto-open) : $LNK2"
"Marker: $((Get-Content $MARKER -Raw).Trim())"
"Cold-start check: powershell -File viewer\door_watchdog.ps1 -Once   (proves the launcher's action)"
"Reboot-survival auto-confirms on the next power-cycle via door_boot_proof.ps1."
"After the next logon: the door OPENS ON ITS OWN once :8090 answers -- no click needed."
