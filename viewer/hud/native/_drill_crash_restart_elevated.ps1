# _drill_crash_restart_elevated.ps1 -- T1-equivalent live drill against the
# REAL native LocalSystem service (must be elevated to kill it). Kills the
# process, times SCM's own restart/5000 recovery action, confirms the
# respawned instance is genuinely fresh (new pid) and native.
$ErrorActionPreference = 'Continue'
$LOGDIR = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs'
$LOG = Join-Path $LOGDIR 'drill_crash_restart.log'
$MARKER = Join-Path $LOGDIR 'drill_crash_restart.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }

$wmi = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD'"
$beforePid = $wmi.ProcessId
"before pid: $beforePid" | Out-File $LOG -Encoding utf8

$t0 = Get-Date
Stop-Process -Id $beforePid -Force
"killed pid=$beforePid at $($t0.ToString('HH:mm:ss.fff'))" | Out-File -Append $LOG

$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  $c = New-Object Net.Sockets.TcpClient
  try { $ar = $c.BeginConnect('127.0.0.1', 8100, $null, $null); if ($ar.AsyncWaitHandle.WaitOne(300)) { $c.EndConnect($ar); $up = $true; $c.Close(); break }; $c.Close() } catch { }
}
$elapsed = ((Get-Date) - $t0).TotalSeconds
$afterWmi = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD'"
$freshPid = $afterWmi.ProcessId -ne $beforePid

"port_up: $up after ${elapsed}s" | Out-File -Append $LOG
"before_pid=$beforePid after_pid=$($afterWmi.ProcessId) fresh_pid=$freshPid" | Out-File -Append $LOG

$instrument = $null
if ($up) {
  try {
    $h = Invoke-WebRequest 'http://127.0.0.1:8100/api/hud/health' -TimeoutSec 3 -UseBasicParsing
    $json = $h.Content | ConvertFrom-Json
    $instrument = $json.envelope.instrument
    "health: instrument=$instrument pid=$($json.result.pid)" | Out-File -Append $LOG
  } catch { "health check failed: $($_.Exception.Message)" | Out-File -Append $LOG }
}

$pass = $up -and $freshPid -and ($instrument -eq 'UNI.Hud.Service@0.2')
"PASS=$pass" | Out-File -Append $LOG
if ($pass) { 0 | Out-File $MARKER -Encoding utf8 } else { 1 | Out-File $MARKER -Encoding utf8 }
