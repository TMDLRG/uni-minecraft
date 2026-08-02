# door_watchdog.ps1 - independent supervisor for launcher.cjs (Mission Control :8090, which serves
# THE DOOR at /door). ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; a UTF-8 dash breaks strings).
#
# The door must survive an apocalypse: it runs INDEPENDENTLY of the studio stack (launcher.cjs is
# deliberately NOT in studio_up.ps1 -Stop's kill lists, and neither is this watchdog), so the door
# stays alive to triage a dead studio. This watchdog is the crash-restart half; the reboot half is
# door_boot_install.ps1 (per-user Startup .vbs) proven by door_boot_proof.ps1. Mirrors the PROVEN
# gaia_watchdog.ps1 pattern.
#
#   powershell -File viewer\door_watchdog.ps1                 # supervise forever (default 5s)
#   powershell -File viewer\door_watchdog.ps1 -Once           # single check-and-restart (tests/gate)
#   powershell -File viewer\door_watchdog.ps1 -IntervalSec 3  # tighter loop
#
# READ-ONLY w.r.t. the repo: it only starts node + appends to logs\door_watchdog.log.
param([switch]$Once, [int]$IntervalSec = 5, [int]$Port = 8090)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SCRIPT = 'viewer\launcher.cjs'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'door_watchdog.log'

function Write-Log([string]$msg) {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Add-Content -Path $LOG -Value "$ts $msg"
}

# Self-dedup via a NAMED MUTEX: the desktop icon (door_open.ps1) may race a boot start - never run
# two supervisors. A CommandLine substring match is WRONG here (any shell whose command text merely
# mentions door_watchdog.ps1 false-matches - proven in the 2026-07-14 T1 drill); only a process that
# actually holds the mutex is a real twin. The OS releases it on process death (abandoned mutex =
# the prior holder died mid-hold - treat as acquired and carry on).
$script:mtx = New-Object System.Threading.Mutex($false, 'UNI_DOOR_WATCHDOG')
$acquired = $false
try { $acquired = $script:mtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired -and -not $Once) { Write-Log 'another door_watchdog holds the mutex - exiting'; exit 0 }

function Launcher-Running {
  [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*launcher.cjs*' })
}
function Start-Launcher {
  $out = Join-Path $LOGDIR 'launcher.out.log'
  $err = Join-Path $LOGDIR 'launcher.err.log'
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList $SCRIPT -WorkingDirectory $ROOT `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log "started launcher.cjs (port $Port)"
}
function Ensure-Launcher {
  if (Launcher-Running) { return $true }
  Write-Log 'launcher.cjs DOWN - restarting'
  Start-Launcher
  Start-Sleep -Seconds 2
  return (Launcher-Running)
}

# THE HEALER (2026-07-15): the active-inference OODA loop that brings the studio to healthy on its own
# (door_healer.cjs). Supervised here so it is durable + boot-persistent like the launcher, and so it
# runs INDEPENDENTLY of the studio stack it heals. It actuates (studio_up on a down surface, spool
# re-seed) but never under a live stream and never presses GO LIVE -- fences are inside door_healer.cjs.
function Healer-Running {
  [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*door_healer.cjs*' })
}
function Start-Healer {
  $out = Join-Path $LOGDIR 'door_healer.out.log'
  $err = Join-Path $LOGDIR 'door_healer.err.log'
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList @('viewer\door_healer.cjs','loop','5000') -WorkingDirectory $ROOT `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log 'started door_healer.cjs (OODA self-heal loop)'
}
function Ensure-Healer {
  if (Healer-Running) { return $true }
  Write-Log 'door_healer.cjs DOWN - restarting'
  Start-Healer
  Start-Sleep -Seconds 1
  return (Healer-Running)
}

if ($Once) {
  $ok = Ensure-Launcher
  $hok = Ensure-Healer
  Write-Log "-Once check: launcher_running=$ok healer_running=$hok"
  if ($ok) { exit 0 } else { exit 1 }
}

Write-Log "door_watchdog started (interval ${IntervalSec}s, port $Port)"
while ($true) {
  Ensure-Launcher | Out-Null
  Ensure-Healer | Out-Null
  Start-Sleep -Seconds $IntervalSec
}
