# door_boot_open.ps1 - ONE-SHOT post-boot auto-open: waits for the door to answer (the
# door_watchdog Startup leg brings it up), then opens it in a Chrome app window ONCE. ASCII ONLY.
#
# This is separate from door_watchdog.ps1 on purpose: the watchdog loops forever (supervising the
# server); this script runs exactly once per logon (Windows Startup-folder semantics) and only ever
# OPENS a window, never re-supervises anything. If you close the window, this script does not
# reopen it -- that would be surprising. The desktop icon (door_open.vbs) remains the on-demand path.
$ErrorActionPreference = 'SilentlyContinue'

function Test-DoorPort {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('127.0.0.1', 8090, $null, $null)
    if ($ar.AsyncWaitHandle.WaitOne(700)) { $c.EndConnect($ar); return $true } else { return $false }
  } catch { return $false } finally { $c.Close() }
}

# Give the door_watchdog Startup leg time to bring launcher.cjs up (cold Node start + npm-free
# require chain is fast, but be generous across a real reboot where disk/AV are also warming up).
$up = $false
for ($i = 0; $i -lt 45; $i++) { if (Test-DoorPort) { $up = $true; break }; Start-Sleep -Seconds 2 }
if (-not $up) { exit 1 }  # honest no-op: the desktop icon still works and shows the offline page if needed

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (Test-Path $chrome) {
  Start-Process $chrome -ArgumentList '--app=http://127.0.0.1:8090/door','--window-size=1280,940','--window-position=100,50'
} else {
  Start-Process 'http://127.0.0.1:8090/door'
}
