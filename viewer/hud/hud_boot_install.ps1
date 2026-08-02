# hud_boot_install.ps1 - install hud_watchdog.ps1 as a per-user logon autostart.
# ASCII ONLY (PS 5.1). Mirrors PROVEN door_boot_install.ps1 / gaia_boot_install.ps1.
#
# Per-user, NON-ELEVATED: a hidden .vbs in the current user's Startup folder
# (no Task Scheduler / admin rights). Local, reversible (-Remove), touches no
# stream key, no go-live, nothing on the chip. Reboot-survival is PROVEN only
# by hud_boot_proof.ps1 (the OS must boot AFTER the install marker AND the
# watchdog must start post-boot AND :8100 answer) - a manual start can never
# false-pass it.
#
# NOTE: This is the FALLBACK leg. The primary leg is the UNI-HUD Windows
# Service (installed by viewer\hud\hud_service_install.ps1). Install BOTH
# for maximum resilience; the watchdog stands down when the service is running.
#
#   powershell -File viewer\hud\hud_boot_install.ps1          # install the logon launcher
#   powershell -File viewer\hud\hud_boot_install.ps1 -Remove  # uninstall it
#   powershell -File viewer\hud\hud_boot_install.ps1 -Status  # show install state
param([switch]$Remove, [switch]$Status)
$ErrorActionPreference = 'Stop'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$WD      = Join-Path $ROOT 'viewer\hud\hud_watchdog.ps1'
$OPEN    = Join-Path $ROOT 'viewer\hud\hud_boot_open.ps1'
$USRSGT  = Join-Path $ROOT 'viewer\hud\hud_user_sight.ps1'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-HUD-Watchdog.vbs'
$LNK2    = Join-Path $STARTUP 'UNI-HUD-AutoOpen.vbs'
$LNK3    = Join-Path $STARTUP 'UNI-HUD-UserSight.vbs'
$LOGDIR  = Join-Path $ROOT 'logs'
$MARKER  = Join-Path $LOGDIR 'hud_boot_install.marker'

if ($Status) {
  "startup_launcher (watchdog)   : $LNK"
  "installed                     : $(Test-Path $LNK)"
  "startup_launcher (auto-open)  : $LNK2"
  "installed                     : $(Test-Path $LNK2)"
  "startup_launcher (user-sight) : $LNK3"
  "installed                     : $(Test-Path $LNK3)"
  "install_marker                : $(if (Test-Path $MARKER) { (Get-Content $MARKER -Raw).Trim() } else { 'none' })"
  exit 0
}
if ($Remove) {
  if (Test-Path $LNK)    { Remove-Item $LNK -Force }
  if (Test-Path $LNK2)   { Remove-Item $LNK2 -Force }
  if (Test-Path $LNK3)   { Remove-Item $LNK3 -Force }
  if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
  "uninstalled: watchdog=$(Test-Path $LNK) auto-open=$(Test-Path $LNK2) user-sight=$(Test-Path $LNK3)"
  exit 0
}
if (-not (Test-Path $WD))    { throw "hud_watchdog.ps1 not found at $WD" }
if (-not (Test-Path $OPEN))  { throw "hud_boot_open.ps1 not found at $OPEN" }
if (-not (Test-Path $USRSGT)){ throw "hud_user_sight.ps1 not found at $USRSGT" }
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }

# TWO Startup entries by design: watchdog LOOPS forever; auto-open runs ONCE
# per logon and only ever opens a Chrome window (never re-supervises).
$vbs = @"
' UNI-HUD-Watchdog - per-user logon autostart for the HUD supervisor (installed by hud_boot_install.ps1).
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$WD" & q, 0, False
"@
Set-Content -Path $LNK -Value $vbs -Encoding ascii

$vbs2 = @"
' UNI-HUD-AutoOpen - one-shot per-logon: waits for the HUD then opens it (installed by hud_boot_install.ps1).
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$OPEN" & q, 0, False
"@
Set-Content -Path $LNK2 -Value $vbs2 -Encoding ascii

# UNI-HUD-UserSight -- user-mode helper that POSTs findings the LocalSystem
# service cannot see (OBS crash sentinels, per-user Chrome state, etc.).
# Runs continuously in the operator's logon session; loop in the script.
$vbs3 = @"
' UNI-HUD-UserSight - runs the user-mode sight helper in the operator's logon session.
' Reads user profile paths + POSTs findings to the LocalSystem service via loopback.
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$USRSGT" & q, 0, False
"@
Set-Content -Path $LNK3 -Value $vbs3 -Encoding ascii

Set-Content -Path $MARKER -Value (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') -Encoding ascii

if (-not (Test-Path $LNK))  { throw "install FAILED: watchdog launcher not present at $LNK" }
if (-not (Test-Path $LNK2)) { throw "install FAILED: auto-open launcher not present at $LNK2" }
if (-not (Test-Path $LNK3)) { throw "install FAILED: user-sight launcher not present at $LNK3" }
"Installed logon launcher (watchdog)   : $LNK"
"Installed logon launcher (auto-open)  : $LNK2"
"Installed logon launcher (user-sight) : $LNK3"
"Marker: $((Get-Content $MARKER -Raw).Trim())"
"Cold-start check: powershell -File viewer\hud\hud_watchdog.ps1 -Once   (proves the launcher action)"
"Reboot-survival auto-confirms on the next power-cycle via hud_boot_proof.ps1."
"After the next logon: the HUD OPENS ON ITS OWN once :8100 answers -- no click needed."
