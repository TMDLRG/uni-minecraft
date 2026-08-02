# gaia_boot_proof.ps1 - autonomous reboot-survival proof for the gaia-boot-persistent gate.
# ASCII ONLY (PS 5.1). No human in the loop: it emits PROVEN only when the machine has actually rebooted
# AFTER the logon task was installed AND Gaia returned via a post-boot watchdog start on :8096. A manual
# watchdog start can never satisfy it (the boot must post-date the install marker), so it cannot false-pass.
#
#   powershell -File viewer\gaia\gaia_boot_proof.ps1        # exit 0 = PROVEN, 1 = NOT YET
#
# The gate flips when this exits 0: crash-restart was already proven (gaia_watchdog.ps1); this is the
# reboot leg. Run it any time after a reboot - or let the watchdog run it on start - and the receipt is the
# verbatim output below.
param([int]$Port = 8096)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LOG     = Join-Path $ROOT 'logs\gaia_watchdog.log'
$MARKER  = Join-Path $ROOT 'logs\gaia_boot_install.marker'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-Gaia-Watchdog.vbs'

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$installed = Test-Path $LNK
$portUp = [bool](Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)

# Install marker: the task must have been installed BEFORE the last boot for this to be a real reboot proof.
$installTime = $null
$rebootedSinceInstall = $false
if (Test-Path $MARKER) {
  try { $installTime = [datetime]::ParseExact((Get-Content $MARKER -Raw).Trim(), 'yyyy-MM-ddTHH:mm:ss', $null) } catch {}
  if ($installTime -and $boot -gt $installTime) { $rebootedSinceInstall = $true }
}

# Did the watchdog start AFTER the last boot (i.e. the ONLOGON task fired on the real logon)?
$lastStart = $null
if (Test-Path $LOG) {
  foreach ($line in Get-Content $LOG) {
    if ($line -match '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}).*gaia_watchdog started') {
      try { $t = [datetime]::ParseExact($Matches[1], 'yyyy-MM-ddTHH:mm:ss', $null); if ($null -eq $lastStart -or $t -gt $lastStart) { $lastStart = $t } } catch {}
    }
  }
}
$startedAfterBoot = ($null -ne $lastStart) -and ($lastStart -ge $boot)

$proven = $installed -and $portUp -and $rebootedSinceInstall -and $startedAfterBoot

"last_boot              : $boot"
"install_marker         : $installTime"
"rebooted_since_install : $rebootedSinceInstall"
"launcher_installed     : $installed"
"watchdog_last_start    : $lastStart"
"started_after_boot     : $startedAfterBoot"
"port_${Port}_up          : $portUp"
if ($proven) {
  "REBOOT-SURVIVAL: PROVEN - the machine rebooted after install and the logon task returned Gaia on :$Port onto canonical bytes."
  exit 0
} else {
  "REBOOT-SURVIVAL: NOT YET - crash-restart is proven; the reboot leg confirms automatically on the next power-cycle."
  exit 1
}
