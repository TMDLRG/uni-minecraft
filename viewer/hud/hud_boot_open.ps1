# hud_boot_open.ps1 - ONE-SHOT post-boot auto-open: waits for the HUD to answer
# (the hud_watchdog or SCM service brings it up), then opens it in a Chrome app
# window ONCE. ASCII ONLY (PS 5.1).
#
# Separate from hud_watchdog.ps1 on purpose: the watchdog loops forever
# (supervising the server); this script runs exactly once per logon (Windows
# Startup-folder semantics) and only ever OPENS a window, never re-supervises
# anything. If you close the window, this script does not reopen it -- that
# would be surprising. The desktop icon (hud_open.vbs) remains the on-demand path.
$ErrorActionPreference = 'SilentlyContinue'

function Test-HudPort {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('127.0.0.1', 8100, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(700)) { $c.EndConnect($ar); return $true } else { return $false }
  } catch { return $false } finally { $c.Close() }
}

# Give the SCM service + hud_watchdog Startup leg time to bring hud_server.cjs
# up (cold Node start + no-npm-runtime-deps require chain is fast, but be
# generous across a real reboot where disk/AV are also warming up).
$up = $false
for ($i = 0; $i -lt 45; $i++) { if (Test-HudPort) { $up = $true; break }; Start-Sleep -Seconds 2 }
if (-not $up) { exit 1 }  # honest no-op: hud_open.vbs still works on demand

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (Test-Path $chrome) {
  Start-Process $chrome -ArgumentList '--app=http://127.0.0.1:8100/hud','--window-size=1920,1080','--window-position=0,0'
} else {
  Start-Process 'http://127.0.0.1:8100/hud'
}
