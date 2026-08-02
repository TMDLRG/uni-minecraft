# gaia_boot_install.ps1 - install gaia_watchdog.ps1 as a per-user logon autostart (boot-persistence).
# ASCII ONLY (PS 5.1).
#
# This is the STUDIO AGENT's own surface: a per-user, NON-ELEVATED logon launcher that starts the Gaia
# supervisor (a READ-ONLY observer) at logon, so gaia_server.cjs returns after a reboot with zero manual
# steps. Mechanism: a hidden .vbs in the current user's Startup folder (no Task Scheduler / admin rights;
# schtasks /Create requires elevation this context lacks). Local, reversible (-Remove), touches no stream
# key, no go-live, nothing on the chip - so the agent installs it directly.
#
# Reboot-survival is PROVEN by gaia_boot_proof.ps1: it emits PROVEN only after the OS has actually rebooted
# AFTER this install marker AND Gaia returned via a post-boot watchdog start. No human in the loop.
#
#   powershell -File viewer\gaia\gaia_boot_install.ps1            # install the logon launcher
#   powershell -File viewer\gaia\gaia_boot_install.ps1 -Remove    # uninstall it
#   powershell -File viewer\gaia\gaia_boot_install.ps1 -Status    # show install state
param([switch]$Remove, [switch]$Status)
$ErrorActionPreference = 'Stop'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$WD      = Join-Path $ROOT 'viewer\gaia\gaia_watchdog.ps1'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-Gaia-Watchdog.vbs'
$LOGDIR  = Join-Path $ROOT 'logs'
$MARKER  = Join-Path $LOGDIR 'gaia_boot_install.marker'

if ($Status) {
  "startup_launcher : $LNK"
  "installed        : $(Test-Path $LNK)"
  "install_marker   : $(if (Test-Path $MARKER) { (Get-Content $MARKER -Raw).Trim() } else { 'none' })"
  exit 0
}
if ($Remove) {
  if (Test-Path $LNK)    { Remove-Item $LNK -Force }
  if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
  "uninstalled: launcher present = $(Test-Path $LNK)"
  exit 0
}
if (-not (Test-Path $WD)) { throw "gaia_watchdog.ps1 not found at $WD" }
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }

# Hidden .vbs launcher: WScript.Shell.Run with window style 0 = no console flash at logon.
# VBS string quoting: the path must be wrapped in double-quotes (it may contain spaces), and in VBScript a
# literal double-quote inside a string is Chr(34) concatenated in - NOT a bare " (that would end the string
# and break the script). Build it with & q & so the generated .vbs is valid regardless of the repo path.
$vbs = @"
' UNI-Gaia-Watchdog - per-user logon autostart for the Gaia supervisor (installed by gaia_boot_install.ps1).
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & "$WD" & q, 0, False
"@
Set-Content -Path $LNK -Value $vbs -Encoding ascii

# Install marker: gaia_boot_proof.ps1 requires the OS to have booted AFTER this, so a manual watchdog start
# can never be mistaken for real reboot-survival. Survives reboot as a file.
Set-Content -Path $MARKER -Value (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') -Encoding ascii

# Honest verify: do not claim success from a print - confirm the launcher landed on disk.
if (-not (Test-Path $LNK)) { throw "install FAILED: launcher not present at $LNK" }
"Installed logon launcher: $LNK"
"Marker: $((Get-Content $MARKER -Raw).Trim())"
"Cold-start check: powershell -File viewer\gaia\gaia_watchdog.ps1 -Once   (proves the launcher's action)"
"Reboot-survival auto-confirms on the next power-cycle via gaia_boot_proof.ps1."
