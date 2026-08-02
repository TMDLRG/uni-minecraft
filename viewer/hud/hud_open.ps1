# hud_open.ps1 - THE HUD ICON PATH. One click always reaches the HUD, even from total cold.
# ASCII ONLY (PS 5.1). Mirrors door_open.ps1 pattern.
#
# Order: (1) ensure hud_watchdog is running (which ensures hud_server.cjs :8100 UNLESS the
# UNI-HUD service is up; in that case the watchdog stands down and the service is the source
# of truth), (2) wait for the port, (3) open the HUD as a Chrome app window.
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Test-HudPort {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('127.0.0.1', 8100, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(700)) { $c.EndConnect($ar); return $true } else { return $false }
  } catch { return $false } finally { $c.Close() }
}

# 1) supervisor up. ALWAYS spawn - the watchdog self-dedups via the UNI_HUD_WATCHDOG named
# mutex and additionally stands down if UNI-HUD SCM service is RUNNING.
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',(Join-Path $ROOT 'viewer\hud\hud_watchdog.ps1')

# 2) wait for :8100 (watchdog interval is 5s; give the cold chain ~14s)
$up = $false
for ($i = 0; $i -lt 14; $i++) { if (Test-HudPort) { $up = $true; break }; Start-Sleep -Seconds 1 }

# 3) open the HUD as a chromeless app window
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path $chrome)) { $chrome = $null }
if ($up) {
  if ($chrome) { Start-Process $chrome -ArgumentList '--app=http://127.0.0.1:8100/hud','--window-size=1920,1080','--window-position=0,0' }
  else { Start-Process 'http://127.0.0.1:8100/hud' }
} else {
  # honest no-op fallback: point at the door (which is the triage entry when the HUD itself
  # cannot start). The door will show hud-DOWN and let the operator triage.
  if ($chrome) { Start-Process $chrome -ArgumentList '--app=http://127.0.0.1:8090/door','--window-size=1280,940','--window-position=100,50' }
  else { Start-Process 'http://127.0.0.1:8090/door' }
}
