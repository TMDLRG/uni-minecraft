# track_watchdog.ps1 - independent supervisor for track_server.cjs (the operator's plane).
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; a UTF-8 dash breaks strings).
#
# WHY THIS EXISTS, AND WHY IT WAS NOT OPTIONAL ANY MORE.
# Until 2026-07-31 TRACK was the ONLY body with no boot path: the Door had UNI-Door-Watchdog.vbs and
# Gaia had UNI-Gaia-Watchdog.vbs in Startup, and TRACK had nothing at all. Measured that day - no
# .ps1 and no .vbs anywhere in the tree restarted it. That was survivable while TRACK was a read-only
# surface: if it died, the operator lost a view and could still read the artifacts underneath.
#
# It stopped being survivable when POST /api/decision landed. TRACK is now the ONLY surface on which
# the operator can RECORD AN ANSWER - the first mutating surface in this programme built for him
# rather than for an agent. If it dies, or the box reboots, the plane loses its only write path and
# nothing brings it back until a human opens a terminal. The organic-operator review called that a
# recovery failure and it was right: "count the steps" was one step too many, and the step was
# invisible.
#
#   powershell -File viewer\track\track_watchdog.ps1                 # supervise forever (default 5s)
#   powershell -File viewer\track\track_watchdog.ps1 -Once           # single check-and-restart (tests/gate)
#   powershell -File viewer\track\track_watchdog.ps1 -IntervalSec 3  # tighter loop
#
# READ-ONLY w.r.t. the repo: it only starts node + appends to logs\track_watchdog.log. It never
# mutates a signal, a gate, a decision row or any source. IT CANNOT WRITE A DECISION - it starts a
# server and nothing else, which matters because the thing it supervises is the operator's voice.
#
# Boot-persistence (survive a REBOOT, not just a crash) is a SEPARATE property: register this script
# as a logon entry via track_boot_install.ps1, then prove it across a real reboot. Until that reboot
# happens: crash-restart PROVEN, reboot-survival PENDING. Those are different claims and collapsing
# them is how a system comes to believe it is durable because a script exists.
# ONE WART, WRITTEN DOWN RATHER THAN LEFT AS A TRAP: `-Once` starts node with redirected stdout and
# stderr, and an interactive shell that launched this script may keep waiting on those inherited
# handles after the script itself has finished its work. It LOOKS like a hang and is not one — the
# server is already up by then; check with `curl 127.0.0.1:8102/healthz` in another shell, or read
# logs\track_watchdog.log, which records the restart the moment it happens. The Startup path is
# unaffected: the .vbs launches it detached with window style 0 and nothing waits on it.
param([switch]$Once, [int]$IntervalSec = 5, [int]$Port = 8102)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SCRIPT = 'viewer\track\track_server.cjs'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'track_watchdog.log'

function Write-Log([string]$msg) {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Add-Content -Path $LOG -Value "$ts $msg"
}
function Track-Running {
  [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*track_server.cjs*' })
}
function Start-Track {
  $out = Join-Path $LOGDIR 'track_server.out.log'
  $err = Join-Path $LOGDIR 'track_server.err.log'
  $env:TRACK_PORT = "$Port"
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList $SCRIPT -WorkingDirectory $ROOT `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log "started track_server.cjs (port $Port)"
}
function Ensure-Track {
  if (Track-Running) { return $true }
  Write-Log 'track_server.cjs DOWN - restarting'
  Start-Track
  Start-Sleep -Seconds 2
  return (Track-Running)
}

if ($Once) {
  $ok = Ensure-Track
  Write-Log "-Once check: track_running=$ok"
  if ($ok) { exit 0 } else { exit 1 }
}

Write-Log "track_watchdog started (interval ${IntervalSec}s, port $Port)"
while ($true) {
  Ensure-Track | Out-Null
  Start-Sleep -Seconds $IntervalSec
}
