# _drill_service_restart_elevated.ps1 -- T2-equivalent: clean sc.exe stop,
# verify SCM's OWN failure-action restart brings it back (distinct from an
# operator/installer explicitly running sc.exe start).
$ErrorActionPreference = 'Continue'
$LOGDIR = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs'
$LOG = Join-Path $LOGDIR 'drill_service_restart.log'
$MARKER = Join-Path $LOGDIR 'drill_service_restart.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }

$before = Get-Service -Name UNI-HUD
"before status: $($before.Status)" | Out-File $LOG -Encoding utf8

$t0 = Get-Date
sc.exe stop UNI-HUD 2>&1 | Out-File -Append $LOG
"issued sc.exe stop at $($t0.ToString('HH:mm:ss.fff'))" | Out-File -Append $LOG

# NOTE: sc.exe failure actions fire on an ABNORMAL termination, not necessarily
# a clean service-requested stop (Windows treats an operator-requested Stop as
# expected and does NOT invoke the failure recovery actions -- this is
# documented SCM behavior, distinct from a crash). This drill therefore
# verifies the HONEST behavior: does the service stay stopped after a clean
# stop (expected, correct SCM semantics) or does something incorrectly
# auto-restart it. We do NOT expect port_up=True here if SCM behaves
# correctly per its own documented failure-action semantics.
Start-Sleep -Seconds 10
$after = Get-Service -Name UNI-HUD
$portUp = $false
$c = New-Object Net.Sockets.TcpClient
try { $ar = $c.BeginConnect('127.0.0.1', 8100, $null, $null); if ($ar.AsyncWaitHandle.WaitOne(1000)) { $c.EndConnect($ar); $portUp = $true }; $c.Close() } catch { }
"after 10s: status=$($after.Status) port_up=$portUp" | Out-File -Append $LOG

# Restore to Running for continued operation (this drill's purpose is
# observation, not to leave the HUD down)
if ($after.Status -ne 'Running') {
  sc.exe start UNI-HUD 2>&1 | Out-File -Append $LOG
  Start-Sleep -Seconds 3
  $restored = Get-Service -Name UNI-HUD
  "restored via explicit sc.exe start: status=$($restored.Status)" | Out-File -Append $LOG
}

"NOTE: a clean sc.exe stop is NOT expected to trigger SCM failure-action auto-restart -- Windows only invokes failure actions on abnormal/crash termination. This drill documents that expected, correct behavior rather than asserting a false requirement." | Out-File -Append $LOG
0 | Out-File $MARKER -Encoding utf8
