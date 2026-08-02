# door_open.ps1 - THE ICON PATH. One click always reaches the door, even from total cold.
# ASCII ONLY (PS 5.1).
#
# Order: (1) ensure door_watchdog is running (which ensures launcher.cjs :8090), (2) wait for the
# port, (3) open the door as a Chrome app window. If the server STILL cannot answer (node itself
# broken - the true apocalypse), open the static offline triage page instead: the door NEVER
# dead-ends on a browser error.
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-DoorPort {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('127.0.0.1', 8090, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(700)) { $c.EndConnect($ar); return $true } else { return $false }
  } catch { return $false } finally { $c.Close() }
}

# 1) supervisor up. ALWAYS spawn - the watchdog self-dedups via a named mutex (a duplicate exits
# itself in <1s), so no fragile process-list matching here (CommandLine substring checks false-match
# any shell that mentions the script name - proven in the 2026-07-14 T1 drill).
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',(Join-Path $ROOT 'viewer\door_watchdog.ps1')

# 2) wait for :8090 (watchdog interval is 5s; give the cold chain ~14s)
$up = $false
for ($i = 0; $i -lt 14; $i++) { if (Test-DoorPort) { $up = $true; break }; Start-Sleep -Seconds 1 }

# 3) open the door (or the honest offline fallback)
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path $chrome)) { $chrome = $null }
if ($up) {
  $target = '--app=http://127.0.0.1:8090/door'
} else {
  $file = ($ROOT -replace '\\','/') + '/viewer/door_offline.html'
  $target = '--app=file:///' + $file
}
if ($chrome) { Start-Process $chrome -ArgumentList $target,'--window-size=1280,940','--window-position=100,50' }
else { Start-Process ($(if ($up) { 'http://127.0.0.1:8090/door' } else { (Join-Path $ROOT 'viewer\door_offline.html') })) }
