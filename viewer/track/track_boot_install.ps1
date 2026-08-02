# track_boot_install.ps1 - make the TRACK watchdog survive a LOGON, not just a crash.
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI).
#
# TWO DIFFERENT CLAIMS, AND COLLAPSING THEM IS HOW A SYSTEM COMES TO BELIEVE IT IS DURABLE.
#   crash-restart    - the watchdog notices a dead track_server.cjs and starts it. PROVEN by killing
#                      the process and running `track_watchdog.ps1 -Once` (measured 2026-07-31: DOWN
#                      detected, restarted, back up in ~2s).
#   reboot-survival  - the watchdog itself comes back after a logon. THIS script is what makes that
#                      possible, and it is still NOT PROVEN until a real reboot happens. Installing a
#                      Startup entry is not evidence that it fired.
#
# This mirrors the two entries already present (UNI-Door-Watchdog.vbs, UNI-Gaia-Watchdog.vbs) rather
# than inventing a mechanism. The .vbs wrapper exists because a raw PowerShell Startup entry flashes
# a console window at every logon; WScript.Shell with a 0 window style does not.
#
#   powershell -File viewer\track\track_boot_install.ps1            # install
#   powershell -File viewer\track\track_boot_install.ps1 -Remove    # uninstall, cleanly
#
# REVERSIBLE IN ONE STEP, and the uninstall is offered in the same file as the install, because a
# persistence mechanism whose removal is undocumented is one the operator cannot decline later.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$WATCHDOG = Join-Path $ROOT 'viewer\track\track_watchdog.ps1'
$STARTUP = [Environment]::GetFolderPath('Startup')
$VBS = Join-Path $STARTUP 'UNI-Track-Watchdog.vbs'

if ($Remove) {
  if (Test-Path $VBS) { Remove-Item -LiteralPath $VBS -Force; Write-Output "removed $VBS" }
  else { Write-Output "not installed: $VBS" }
  exit 0
}

if (-not (Test-Path $WATCHDOG)) { Write-Error "watchdog not found at $WATCHDOG"; exit 1 }

$q = [char]34
$lines = @(
  "' UNI-Track-Watchdog - per-user logon autostart for the TRACK supervisor (installed by track_boot_install.ps1).",
  "' TRACK is the ONLY surface on which the operator can RECORD AN ANSWER (POST /api/decision).",
  "' Before 2026-07-31 it was the one body with no boot path at all.",
  'Set sh = CreateObject("WScript.Shell")',
  'q = Chr(34)',
  "sh.Run ${q}powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ${q} & q & ${q}$WATCHDOG${q} & q, 0, False"
)
Set-Content -Path $VBS -Value $lines -Encoding ASCII
Write-Output "installed $VBS"
Write-Output "  -> $WATCHDOG"
Write-Output ""
Write-Output "crash-restart: PROVEN. reboot-survival: NOT PROVEN until this box is actually rebooted."
Write-Output "Uninstall with: powershell -File viewer\track\track_boot_install.ps1 -Remove"
