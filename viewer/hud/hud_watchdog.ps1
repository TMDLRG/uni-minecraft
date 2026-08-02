# hud_watchdog.ps1 - independent supervisor for the LEGACY hud_server.cjs
# fallback path. ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; a UTF-8
# dash breaks strings).
#
# NOTE (2026-07-14): the primary UNI-HUD is now a native .NET service (see
# viewer\hud\native\**), which the SCM-precedence check below (Service-Running)
# already stands this watchdog down for -- Hud-Running()/Start-Hud() below are
# DORMANT under normal operation. They are kept only as a last-resort fallback
# if the SCM service is ever removed AND nothing else supervises the native
# exe; Start-Hud below launches the CURRENT native binary via `sc.exe start`,
# not the retired Node hud_server.cjs (which this watchdog originally targeted).
#
# THE HUD IS THE THIRD INDEPENDENT SURFACE, next to The Door and Gaia. Boot
# persistence has THREE legs, in precedence order:
#   1. SCM Windows Service (UNI-HUD, native .NET) -- primary. If RUNNING, this
#      watchdog exits silently: two supervisors would race for the port.
#   2. This watchdog -- fallback for when the service is not installed, has
#      been removed, or the operator chose to skip elevated install. Attempts
#      `sc.exe start UNI-HUD` (the registered service, whatever binary it
#      currently points at) rather than spawning a process directly.
#   3. Manual click on the desktop icon (viewer\hud\native\hud_widget_open.vbs
#      for the widget; hud_open.vbs here is legacy) -- cold triage.
#
# Mirrors the PROVEN door_watchdog.ps1 / gaia_watchdog.ps1 pattern (named
# mutex self-dedup; -Once mode for gates; ASCII-only PS 5.1).
#
#   powershell -File viewer\hud\hud_watchdog.ps1                 # supervise forever (default 5s)
#   powershell -File viewer\hud\hud_watchdog.ps1 -Once           # single check-and-restart (tests/gate)
#   powershell -File viewer\hud\hud_watchdog.ps1 -IntervalSec 3  # tighter loop
#   powershell -File viewer\hud\hud_watchdog.ps1 -MutexProbe     # side-effect-free mutex drill (T0)
#
# READ-ONLY w.r.t. the repo: only starts node + appends logs\hud_watchdog.log.
param([switch]$Once, [switch]$MutexProbe, [int]$IntervalSec = 5, [int]$Port = 8100)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SCRIPT = 'viewer\hud\hud_server.cjs'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'hud_watchdog.log'

function Write-Log([string]$msg) {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Add-Content -Path $LOG -Value "$ts $msg"
}

# Named-mutex self-dedup (CommandLine substring matching is a proven footgun -
# any shell whose text mentions this script false-matches). Named mutex is the
# only real "am I a twin?" check. Abandoned = prior holder died mid-hold.
$script:mtx = New-Object System.Threading.Mutex($false, 'UNI_HUD_WATCHDOG')
$acquired = $false
try { $acquired = $script:mtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }

if ($MutexProbe) {
  if ($acquired) { 'MUTEX: HELD (this instance would proceed)'; Start-Sleep 3 } else { 'MUTEX: BUSY (another hud_watchdog in flight - would exit without starting anything)' }
  exit 0
}
if (-not $acquired -and -not $Once) { Write-Log 'another hud_watchdog holds the mutex - exiting'; exit 0 }

# SCM precedence: if UNI-HUD service is RUNNING, this watchdog stands down.
function Service-Running {
  try {
    $svc = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') { return $true }
  } catch { }
  return $false
}
function Hud-Running {
  # Port-based check (binary-agnostic): the native service and the legacy
  # Node fallback both, when running, bind :8100. Checking the port rather
  # than a specific process name means this stays correct regardless of
  # which binary is actually behind the service registration.
  [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}
function Start-Hud {
  # Last-resort fallback: ask SCM to start the CURRENTLY REGISTERED UNI-HUD
  # service (the native .exe today), rather than spawning node.exe
  # hud_server.cjs directly -- that retired binary is not guaranteed to be
  # present or correct on disk, and spawning it directly would create a
  # split-brain second process racing the SCM-registered one.
  sc.exe start UNI-HUD 2>&1 | Out-Null
  Write-Log "invoked 'sc.exe start UNI-HUD' (port $Port) -- SCM leg was not present/running"
}
function Ensure-Hud {
  if (Service-Running) { return $true }   # SCM has this covered
  if (Hud-Running) { return $true }
  Write-Log 'UNI-HUD DOWN - restarting via sc.exe start (SCM leg not present or not running)'
  Start-Hud
  Start-Sleep -Seconds 2
  return (Hud-Running)
}

if ($Once) {
  $ok = Ensure-Hud
  Write-Log "-Once check: hud_running=$ok scm=$(Service-Running)"
  if ($ok) { exit 0 } else { exit 1 }
}

Write-Log "hud_watchdog started (interval ${IntervalSec}s, port $Port)"
while ($true) {
  Ensure-Hud | Out-Null
  Start-Sleep -Seconds $IntervalSec
}
