# gaia_watchdog.ps1 - independent supervisor for gaia_server.cjs (the always-on world-visibility organ).
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; a UTF-8 dash breaks strings).
#
# Gaia runs INDEPENDENTLY of the studio stack (like launcher.cjs) - it must keep mirroring the system
# even when OBS / MediaMTX / the colony are all cold. This watchdog is that independence: it ensures
# gaia_server.cjs is always running and restarts it within one interval if it dies. It is the
# "self-sustaining" half of the lifecycle - process death is survived without a human.
#
#   powershell -File viewer\gaia\gaia_watchdog.ps1                 # supervise forever (default 5s)
#   powershell -File viewer\gaia\gaia_watchdog.ps1 -Once           # single check-and-restart (tests/gate)
#   powershell -File viewer\gaia\gaia_watchdog.ps1 -IntervalSec 3  # tighter loop
#
# READ-ONLY w.r.t. the repo: it only starts node + appends to logs\gaia_watchdog.log. It never mutates
# a signal, a gate, or any source. Boot-persistence (survive a REBOOT, not just a crash) is a SEPARATE
# property: register this script as a logon Scheduled Task via gaia_boot_install.ps1 (operator step),
# then prove it across a real reboot - the gaia-boot-persistent gate. Until then: crash-restart PROVEN,
# reboot-survival PENDING.
param([switch]$Once, [int]$IntervalSec = 5, [int]$Port = 8096)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SCRIPT = 'viewer\gaia\gaia_server.cjs'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'gaia_watchdog.log'

function Write-Log([string]$msg) {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Add-Content -Path $LOG -Value "$ts $msg"
}
function Gaia-Running {
  [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*gaia_server.cjs*' })
}
function Start-Gaia {
  $out = Join-Path $LOGDIR 'gaia_server.out.log'
  $err = Join-Path $LOGDIR 'gaia_server.err.log'
  $env:GAIA_PORT = "$Port"
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList $SCRIPT -WorkingDirectory $ROOT `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log "started gaia_server.cjs (port $Port)"
}
function Ensure-Gaia {
  if (Gaia-Running) { return $true }
  Write-Log 'gaia_server.cjs DOWN - restarting'
  Start-Gaia
  Start-Sleep -Seconds 2
  return (Gaia-Running)
}

# The litigation-hold capture loop: preserve the colony minds on a cadence. Supervised here so it is
# boot-persistent + auto-restarting for free (one Startup entry boots the watchdog which boots both).
function Loop-Running {
  [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*capture_minds_loop.cjs*' })
}
function Ensure-Loop {
  if (Loop-Running) { return $true }
  $out = Join-Path $LOGDIR 'capture_minds_loop.out.log'
  $err = Join-Path $LOGDIR 'capture_minds_loop.err.log'
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList 'viewer\gaia\capture_minds_loop.cjs' `
    -WorkingDirectory $ROOT -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log 'capture_minds_loop.cjs DOWN - started'
  return $true
}

if ($Once) {
  $ok = Ensure-Gaia
  Ensure-Loop | Out-Null
  Write-Log "-Once check: gaia_running=$ok"
  if ($ok) { exit 0 } else { exit 1 }
}

Write-Log "gaia_watchdog started (interval ${IntervalSec}s, port $Port)"
while ($true) {
  Ensure-Gaia | Out-Null
  Ensure-Loop | Out-Null
  Start-Sleep -Seconds $IntervalSec
}
