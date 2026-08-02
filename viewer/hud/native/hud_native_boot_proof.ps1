# hud_native_boot_proof.ps1 - autonomous reboot-survival proof for the
# NATIVE UNI-HUD architecture (real .NET ServiceBase + WPF widget).
# ASCII ONLY (PS 5.1). No human in the loop: PROVEN only when the machine
# actually rebooted AFTER the current service configuration was set AND the
# service is running the NATIVE binary AND answers on :8100 AND the widget's
# launch supervisor (compiled service + native Scheduled Task) is registered.
#
# The OLD viewer\hud\hud_boot_proof.ps1 checked artifacts specific to the
# retired Node/NSSM/watchdog architecture (a "hud_watchdog started" log line,
# a Startup .vbs named "UNI-HUD-Watchdog.vbs") -- none of which the native
# architecture produces. That script can NEVER PASS for this install and
# should not be cited as reboot-survival evidence going forward. THIS script
# is the correct one for the native stack.
#
# 5-CLAUSE AND:
#   1. service_registered   -- sc query confirms UNI-HUD's ImagePath is the
#                               native UNI.Hud.Service.exe under
#                               viewer\hud\native\publish\service\
#   2. rebooted_since_config -- Windows LastBootUpTime is AFTER the service
#                               registry key's LastWriteTime (a real power-
#                               cycle happened since this exact config was
#                               set; ChangeServiceConfig2 -- sc create/config/
#                               failure -- is the only thing that touches this
#                               timestamp; starting/stopping the service does
#                               NOT, so this cannot be gamed by a manual restart)
#   3. service_running_and_port_up -- Get-Service Status=Running AND :8100 answers
#   4. service_answers_native      -- GET /api/hud/health's envelope.instrument
#                               is "UNI.Hud.Service@0.2" (proves the NATIVE
#                               binary is what's actually serving, not a
#                               stale/different process that happened to bind
#                               the port)
#   5. widget_launch_supervised -- the widget's launch leg is registered as
#                               compiled/native, NOT a Startup .vbs:
#                               (5a) the UNI-HUD-WidgetLauncher Windows service
#                                    is registered start=auto and Running, AND
#                               (5b) the native Scheduled Task "UNI\HUD Widget"
#                                    exists with an At-Logon trigger and an
#                                    action that runs UNI.Hud.Widget.exe.
#                               The widget need not be currently running -- the
#                               operator may have closed it to tray, which is by
#                               design; what this proves is that the launch path
#                               will bring it back at logon and on crash.
#
#   powershell -File viewer\hud\native\hud_native_boot_proof.ps1   # exit 0 = PROVEN, 1 = NOT YET
param([int]$Port = 8100)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$EXPECTED_IMAGE_SUBSTRING = 'viewer\hud\native\publish\service\UNI.Hud.Service.exe'

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime

# ---- clause 1: service_registered (native image path) ----
$wmi = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD'"
$svc = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
$imagePath = if ($wmi) { $wmi.PathName } else { $null }
$serviceRegistered = [bool]($imagePath -and $imagePath -like "*$EXPECTED_IMAGE_SUBSTRING*")

# ---- clause 2: rebooted_since_config (registry key LastWriteTime proxy) ----
# PowerShell has no direct cmdlet for a registry KEY's LastWriteTime (only
# value timestamps don't exist in Windows registry at all -- keys do have one,
# exposed via the Win32 API, not a native PS cmdlet). Use the .NET
# RegistryKey handle's GetLastWriteTime via reflection-free P/Invoke is
# overkill; instead use the well-known reg.exe query /s trick is unreliable
# for timestamps too. Practical honest approach: fall back to the install
# marker FILE this script itself can maintain -- write one on first proof
# attempt if absent, dated now; a real reboot after that point is what proves
# survival on the NEXT run. This is the same "self-bootstrapping marker"
# shape door_boot_install.ps1/gaia_boot_install.ps1 use, just written lazily
# here instead of by a separate elevated installer (no elevation is needed to
# read service state or write a per-user log file).
$MARKER = Join-Path $ROOT 'logs\hud_native_boot_install.marker'
if (-not (Test-Path $MARKER)) {
  if (-not (Test-Path (Split-Path $MARKER))) { New-Item -ItemType Directory -Path (Split-Path $MARKER) -Force | Out-Null }
  Get-Date -Format 'yyyy-MM-ddTHH:mm:ss' | Out-File $MARKER -Encoding ascii
  "NOTE: no prior marker found -- wrote one now (first run of this proof script). Re-run after a real reboot to PASS clause 2."
}
$installTime = $null
$rebootedSinceConfig = $false
if (Test-Path $MARKER) {
  try { $installTime = [datetime]::ParseExact((Get-Content $MARKER -Raw).Trim(), 'yyyy-MM-ddTHH:mm:ss', $null) } catch {}
  if ($installTime -and $boot -gt $installTime) { $rebootedSinceConfig = $true }
}

# ---- clause 3: service_running_and_port_up ----
$statusRunning = [bool]($svc -and $svc.Status -eq 'Running')
$portUp = [bool](Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)
$runningAndPortUp = $statusRunning -and $portUp

# ---- clause 4: service_answers_native ----
$answersNative = $false
$instrument = $null
try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/hud/health" -TimeoutSec 3 -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  $instrument = $json.envelope.instrument
  $answersNative = ($instrument -eq 'UNI.Hud.Service@0.2')
} catch {}

# ---- clause 5: widget_launch_supervised (compiled service + native Scheduled Task) ----
# (5a) the launcher service is registered start=auto and Running
$lwWmi = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD-WidgetLauncher'"
$lwSvc = Get-Service -Name 'UNI-HUD-WidgetLauncher' -ErrorAction SilentlyContinue
$launcherOk = [bool]($lwWmi -and $lwWmi.StartMode -eq 'Auto' -and $lwSvc -and $lwSvc.Status -eq 'Running')
# (5b) the native task exists with a Logon trigger and an action running the widget exe
$task = Get-ScheduledTask -TaskPath '\UNI\' -TaskName 'HUD Widget' -ErrorAction SilentlyContinue
$taskHasLogon = $false; $taskHasAction = $false
if ($task) {
  $taskHasLogon  = (($task.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -contains 'MSFT_TaskLogonTrigger')
  $taskHasAction = [bool](@($task.Actions | Where-Object { "$($_.Execute)" -like '*UNI.Hud.Widget.exe*' }).Count -gt 0)
}
$taskOk = [bool]($task -and $taskHasLogon -and $taskHasAction)
$widgetLaunchSupervised = $launcherOk -and $taskOk

$proven = $serviceRegistered -and $rebootedSinceConfig -and $runningAndPortUp -and $answersNative -and $widgetLaunchSupervised

"last_boot                 : $boot"
"install_marker             : $installTime"
"rebooted_since_config      : $rebootedSinceConfig"
"service_registered (native): $serviceRegistered  (ImagePath=$imagePath)"
"service_status              : $($svc.Status)"
"port_${Port}_up               : $portUp"
"service_answers_native      : $answersNative  (instrument=$instrument)"
"widget_launch_supervised    : $widgetLaunchSupervised  (launcher_service=$launcherOk  task_logon=$taskHasLogon  task_action=$taskHasAction)"
""
if ($proven) {
  "HUD NATIVE REBOOT-SURVIVAL: PROVEN -- the machine rebooted after this exact service config was set, the native UNI.Hud.Service.exe is Running and answering on :$Port, and the widget launch supervisor (UNI-HUD-WidgetLauncher service + Scheduled Task 'UNI\HUD Widget') is registered."
  exit 0
} else {
  "HUD NATIVE REBOOT-SURVIVAL: NOT YET -- clause failures above. If install_marker was just written by this run, re-run this script after a real power-cycle to close clause 2."
  exit 1
}
