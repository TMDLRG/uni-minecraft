# _swap_widget_quiet_elevated.ps1 - ELEVATED swap of the HUD widget binary.
# ASCII ONLY (PS 5.1 reads a BOM-less .ps1 as CP1252).
#
# WHY ELEVATION IS REQUIRED, and why the non-elevated attempt failed:
# UNI-HUD-WidgetLauncher is a Windows service whose job is to keep the widget alive. Measured
# 2026-08-17: killing the widget and copying immediately LOST THE RACE - the launcher restarted it in
# 1 second and UNI.Hud.Widget.dll was locked again before the copy finished, so the swap silently
# left the OLD binary in place while the widget appeared to come back fine. That is a false green:
# the widget was running, just not the new code.
#
# The only correct order is: stop the SERVICE, then the widget cannot be resurrected mid-copy.
# Stopping/starting a service needs administrator rights - hence this file.
#
# It is idempotent and it VERIFIES: it refuses to declare success unless the live exe timestamp
# actually moved and the widget came back running.
$ErrorActionPreference = 'Stop'
$N   = 'C:\Users\mpolz\Documents\UNI.Minecraft\viewer\hud\native'
$SRC = Join-Path $N 'publish\widget_new'
$DST = Join-Path $N 'publish\widget'
$log = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs\hud_widget_swap.log'
function Say($m){ $l = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $m; Add-Content -LiteralPath $log -Value $l -Encoding ascii; Write-Output $l }

Say '==== HUD widget swap (elevated) ===='
$before = (Get-Item (Join-Path $DST 'UNI.Hud.Widget.exe')).LastWriteTime
Say ("live exe BEFORE: " + $before)

Say 'stopping UNI-HUD-WidgetLauncher (so it cannot resurrect the widget mid-copy)'
Stop-Service -Name 'UNI-HUD-WidgetLauncher' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Say 'stopping the widget process'
Get-Process UNI.Hud.Widget -ErrorAction SilentlyContinue | ForEach-Object { Say ("  kill PID=" + $_.Id); Stop-Process -Id $_.Id -Force }
Start-Sleep -Seconds 2

Say 'copying new binaries'
Copy-Item (Join-Path $SRC '*') $DST -Recurse -Force
$after = (Get-Item (Join-Path $DST 'UNI.Hud.Widget.exe')).LastWriteTime
Say ("live exe AFTER : " + $after)

Say 'starting UNI-HUD-WidgetLauncher'
Start-Service -Name 'UNI-HUD-WidgetLauncher' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# The launcher triggers the Scheduled Task at logon; if the widget is not back quickly, start it
# directly so the operator is never left without his glance surface.
$n = 0
while ($n -lt 15 -and -not (Get-Process UNI.Hud.Widget -ErrorAction SilentlyContinue)) { Start-Sleep 1; $n++ }
if (-not (Get-Process UNI.Hud.Widget -ErrorAction SilentlyContinue)) {
  Say 'launcher did not bring the widget back - starting it directly'
  Start-Process (Join-Path $DST 'UNI.Hud.Widget.exe')
  Start-Sleep -Seconds 4
}
$w = Get-Process UNI.Hud.Widget -ErrorAction SilentlyContinue

# VERIFY - do not claim success on "it is running"; the whole defect above was a running widget with
# old code. Success requires the timestamp to have MOVED and the widget to be back.
$swapped = ($after -gt $before)
$running = [bool]$w
Say ("RESULT: binary_swapped=" + $swapped + "  widget_running=" + $running + $(if($w){" PID=" + $w.Id}else{""}))
if ($swapped -and $running) { Say 'SWAP OK - the widget is running the NEW binary (quiet button included)'; exit 0 }
Say 'SWAP INCOMPLETE - see above'
exit 1
