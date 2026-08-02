# door_boot_proof.ps1 - autonomous reboot-survival proof for the door-boot-persistent gate leg.
# ASCII ONLY (PS 5.1). No human in the loop: PROVEN only when the machine actually rebooted AFTER
# door_boot_install.ps1's marker AND the watchdog started post-boot AND the door answers on :8090.
# A manual watchdog start can never satisfy it (the boot must post-date the install marker).
#
#   powershell -File viewer\door_boot_proof.ps1        # exit 0 = PROVEN, 1 = NOT YET
param([int]$Port = 8090)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LOG     = Join-Path $ROOT 'logs\door_watchdog.log'
$MARKER  = Join-Path $ROOT 'logs\door_boot_install.marker'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-Door-Watchdog.vbs'

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$installed = Test-Path $LNK
$portUp = [bool](Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)

$installTime = $null
$rebootedSinceInstall = $false
if (Test-Path $MARKER) {
  try { $installTime = [datetime]::ParseExact((Get-Content $MARKER -Raw).Trim(), 'yyyy-MM-ddTHH:mm:ss', $null) } catch {}
  if ($installTime -and $boot -gt $installTime) { $rebootedSinceInstall = $true }
}

$lastStart = $null
if (Test-Path $LOG) {
  foreach ($line in Get-Content $LOG) {
    if ($line -match '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}).*door_watchdog started') {
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
  "DOOR REBOOT-SURVIVAL: PROVEN - the machine rebooted after install and the logon task returned the door on :$Port."
  exit 0
} else {
  "DOOR REBOOT-SURVIVAL: NOT YET - crash-restart + cold one-click are the proven legs; the reboot leg confirms automatically on the next power-cycle."
  exit 1
}
