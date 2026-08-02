# hud_boot_proof.ps1 - autonomous reboot-survival proof for the hud-boot-persistent gate.
# ASCII ONLY (PS 5.1). No human in the loop: PROVEN only when the machine
# actually rebooted AFTER hud_boot_install.ps1's marker AND *some* supervision
# leg (SCM Windows Service OR the watchdog Startup .vbs) started post-boot AND
# the HUD answers on :8100. A manual start can never satisfy it (the boot must
# post-date the install marker).
#
# 5-CLAUSE AND (mirrors door_boot_proof.ps1 with one extension):
#   1. install marker present                    (hud_boot_install.ps1 ran)
#   2. Windows LastBootUpTime > install marker   (real power-cycle since install)
#   3. port :8100 up                             (HUD is serving)
#   4. supervised by SCM (UNI-HUD RUNNING) OR watchdog started after boot
#   5. Startup .vbs present (proves the fallback leg installed)
#
# Either the SCM Windows Service or the watchdog Startup leg counts as "supervised".
# We do NOT require both -- the operator may choose only the fallback leg.
#
#   powershell -File viewer\hud\hud_boot_proof.ps1   # exit 0 = PROVEN, 1 = NOT YET
param([int]$Port = 8100)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LOG     = Join-Path $ROOT 'logs\hud_watchdog.log'
$MARKER  = Join-Path $ROOT 'logs\hud_boot_install.marker'
$STARTUP = [Environment]::GetFolderPath('Startup')
$LNK     = Join-Path $STARTUP 'UNI-HUD-Watchdog.vbs'

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
    if ($line -match '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}).*hud_watchdog started') {
      try { $t = [datetime]::ParseExact($Matches[1], 'yyyy-MM-ddTHH:mm:ss', $null); if ($null -eq $lastStart -or $t -gt $lastStart) { $lastStart = $t } } catch {}
    }
  }
}
$watchdogStartedAfterBoot = ($null -ne $lastStart) -and ($lastStart -ge $boot)

$scmRunning = $false
try {
  $svc = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') { $scmRunning = $true }
} catch {}
$supervised = $scmRunning -or $watchdogStartedAfterBoot

$proven = $installed -and $portUp -and $rebootedSinceInstall -and $supervised

"last_boot              : $boot"
"install_marker         : $installTime"
"rebooted_since_install : $rebootedSinceInstall"
"launcher_installed     : $installed"
"watchdog_last_start    : $lastStart"
"watchdog_after_boot    : $watchdogStartedAfterBoot"
"scm_UNI-HUD_running    : $scmRunning"
"supervised             : $supervised"
"port_${Port}_up          : $portUp"
if ($proven) {
  "HUD REBOOT-SURVIVAL: PROVEN (rebooted_since_install=True; supervised=$(if ($scmRunning) { 'SCM' } else { 'watchdog' }); port_$Port up=True) - the machine rebooted after install and the HUD returned on :$Port."
  exit 0
} else {
  "HUD REBOOT-SURVIVAL: NOT YET - crash-restart + cold one-click are the proven legs; the reboot leg confirms automatically on the next power-cycle."
  exit 1
}
