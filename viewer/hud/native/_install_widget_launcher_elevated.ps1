# _install_widget_launcher_elevated.ps1 - runs ELEVATED. Registers UNI-HUD-WidgetLauncher
# as a real Windows Service via sc.exe. Also removes the legacy Startup .vbs so the boot
# path is 100% compiled/native, no script:
#   SCM -> UNI.Hud.WidgetLauncher.exe (this service) -> Windows Task Scheduler service
#       -> UNI.Hud.Widget.exe (WPF, in the operator's session).
# The service self-registers a native Scheduled Task "UNI\HUD Widget" (interactive-token,
# at-logon) on start and triggers it whenever the widget is absent. This installer verifies
# BOTH the service is Running AND that task exists before it declares success.
#
# ASCII ONLY (Windows PowerShell 5.1 launches elevated sessions and 5.1 parses this file with
# the current OEM code page; a non-ASCII char in a string literal is a parse error at LOAD
# time, which means the script crashes before line 1 runs and the caller never sees a log).
# Idempotent: safe to run again if the service already exists (it stops, uninstalls, reinstalls).
$ErrorActionPreference = 'Continue'
$LOGDIR = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG    = Join-Path $LOGDIR 'install_widget_launcher.log'
$MARKER = Join-Path $LOGDIR 'install_widget_launcher.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') ----" | Out-File $LOG -Encoding utf8

try {
    $NATIVE = 'C:\Users\mpolz\Documents\UNI.Minecraft\viewer\hud\native'
    $CSPROJ = Join-Path $NATIVE 'UNI.Hud.WidgetLauncher\UNI.Hud.WidgetLauncher.csproj'
    $EXE    = Join-Path $NATIVE 'publish\widget_launcher\UNI.Hud.WidgetLauncher.exe'
    if (-not (Test-Path $CSPROJ)) { throw "csproj missing: $CSPROJ" }

    "== step 1: remove legacy Startup .vbs (script path being retired) ==" | Out-File -Append $LOG
    $STARTUP_VBS = Join-Path ([Environment]::GetFolderPath('Startup')) 'UNI-HUD-Widget.vbs'
    if (Test-Path $STARTUP_VBS) {
        Remove-Item $STARTUP_VBS -Force
        "  removed $STARTUP_VBS" | Out-File -Append $LOG
    } else { "  no legacy .vbs at $STARTUP_VBS" | Out-File -Append $LOG }

    "== step 2: stop + uninstall any prior instance ==" | Out-File -Append $LOG
    $exists = (sc.exe query UNI-HUD-WidgetLauncher 2>&1) -join "`n"
    if ($exists -notmatch 'FAILED 1060') {
        sc.exe stop UNI-HUD-WidgetLauncher 2>&1 | Out-File -Append $LOG
        # Wait up to 15s for the SCM to report Stopped. A hosted service that ignores the stop
        # signal (or is stuck in a Task.Delay before observing the CancellationToken) can hold the
        # .dll and the SCM registration for an unbounded time. We force below either way.
        $deadline = (Get-Date).AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 500
            $svc = Get-Service -Name 'UNI-HUD-WidgetLauncher' -ErrorAction SilentlyContinue
        } while ($svc -and $svc.Status -ne 'Stopped' -and (Get-Date) -lt $deadline)
        # Force-kill any lingering UNI.Hud.WidgetLauncher process regardless of SCM state. This
        # releases the .dll lock (which is what breaks `dotnet publish` on re-run). Elevated.
        Get-Process UNI.Hud.WidgetLauncher -ErrorAction SilentlyContinue | ForEach-Object {
            "  force-killing lingering process pid=$($_.Id)" | Out-File -Append $LOG
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep 1
        sc.exe delete UNI-HUD-WidgetLauncher 2>&1 | Out-File -Append $LOG
        Start-Sleep 2
    }

    "== step 2b: publish the fresh binary (now that .dll is unlocked) ==" | Out-File -Append $LOG
    # dotnet may not be on PATH for the SYSTEM/elevated context. Try common locations, fall back
    # to the operator's scoop install path (which is what this box uses per Get-Command output).
    $dotnet = $null
    foreach ($candidate in @(
        (Get-Command dotnet -ErrorAction SilentlyContinue).Source,
        'C:\Program Files\dotnet\dotnet.exe',
        'C:\Users\mpolz\scoop\apps\dotnet-sdk\current\dotnet.exe'
    )) {
        if ($candidate -and (Test-Path $candidate)) { $dotnet = $candidate; break }
    }
    if (-not $dotnet) { throw "dotnet not found in any known location" }
    "  using dotnet: $dotnet" | Out-File -Append $LOG
    $publishOut = Join-Path $NATIVE 'publish\widget_launcher'
    & $dotnet publish $CSPROJ -c Release -r win-x64 --self-contained true -o $publishOut -v q --nologo 2>&1 | Out-File -Append $LOG
    if (-not (Test-Path $EXE)) { throw "publish failed - exe not present at $EXE" }
    $exeInfo = Get-Item $EXE
    "  published: $EXE  size=$($exeInfo.Length)  mtime=$($exeInfo.LastWriteTime)" | Out-File -Append $LOG

    "== step 3: register the service ==" | Out-File -Append $LOG
    # LocalSystem is required to register + trigger a Scheduled Task that runs as the
    # logged-on operator (interactive token, no stored password). NetworkService cannot do
    # this cross-user. The service exposes NO network surface. No user credential is ever
    # captured or stored - the task runs under an interactive token.
    $binPath = "`"$EXE`""
    sc.exe create UNI-HUD-WidgetLauncher `
        binPath= $binPath `
        DisplayName= "UNI HUD Widget Launcher (native)" `
        start= auto `
        obj= LocalSystem 2>&1 | Out-File -Append $LOG

    sc.exe description UNI-HUD-WidgetLauncher `
        "Compiled Windows Service that supervises the UNI HUD widget (UNI.Hud.Widget.exe). Registers a native Windows Scheduled Task (UNI\HUD Widget, interactive-token, at-logon) and triggers it whenever the widget is absent, so the Task Scheduler service spawns the widget in the operator session. Session 0 isolation forbids the service from drawing UI itself. Replaces the retired Startup .vbs; the boot path is now SCM -> this service -> Task Scheduler -> widget, no script." 2>&1 | Out-File -Append $LOG

    # Auto-restart on crash: 5s, 5s, 5s; reset counter after 24h.
    sc.exe failure UNI-HUD-WidgetLauncher reset= 86400 actions= restart/5000/restart/5000/restart/5000 2>&1 | Out-File -Append $LOG

    "== step 4: start it ==" | Out-File -Append $LOG
    sc.exe start UNI-HUD-WidgetLauncher 2>&1 | Out-File -Append $LOG

    Start-Sleep 3
    $svc = Get-Service -Name 'UNI-HUD-WidgetLauncher' -ErrorAction SilentlyContinue
    $cim = Get-CimInstance Win32_Service -Filter "Name='UNI-HUD-WidgetLauncher'"
    "post-install:" | Out-File -Append $LOG
    "  State     : $($svc.Status)"        | Out-File -Append $LOG
    "  StartMode : $($cim.StartMode)"     | Out-File -Append $LOG
    "  StartName : $($cim.StartName)"     | Out-File -Append $LOG
    "  PathName  : $($cim.PathName)"      | Out-File -Append $LOG

    "== step 5: confirm the service self-registered the Scheduled Task ==" | Out-File -Append $LOG
    # The service registers "UNI\HUD Widget" on its first tick (only when an operator is
    # logged on). Poll up to ~12s so we do not race the first tick.
    $taskOk = $false
    $deadline = (Get-Date).AddSeconds(12)
    do {
        $q = (schtasks /query /tn "UNI\HUD Widget" /fo LIST 2>&1) -join "`n"
        if ($q -notmatch 'ERROR' -and $q -match 'HUD Widget') { $taskOk = $true; break }
        Start-Sleep -Milliseconds 750
    } while ((Get-Date) -lt $deadline)
    "  task_registered : $taskOk" | Out-File -Append $LOG
    (schtasks /query /tn "UNI\HUD Widget" /v /fo LIST 2>&1) -join "`n" | Out-File -Append $LOG

    if ($svc.Status -eq 'Running' -and $taskOk) {
        "ok" | Out-File $MARKER -Encoding ascii
        # Installing the launcher changed the native HUD config, so the combined native stack
        # (backend service + widget launcher + task) must be RE-PROVEN across a real power-cycle.
        # Refresh the reboot marker hud_native_boot_proof.ps1 reads for clause 2, so the gate is
        # honestly NOT-YET until the operator's next reboot (then it auto-confirms).
        $BOOTMARKER = Join-Path $LOGDIR 'hud_native_boot_install.marker'
        Get-Date -Format 'yyyy-MM-ddTHH:mm:ss' | Out-File $BOOTMARKER -Encoding ascii
        "  refreshed reboot marker $BOOTMARKER (reboot-survival re-proves on next power-cycle)" | Out-File -Append $LOG
    } elseif ($svc.Status -ne 'Running') {
        "fail: service not running (status=$($svc.Status))" | Out-File $MARKER -Encoding ascii
    } else {
        "fail: service Running but task 'UNI\HUD Widget' not registered (is an operator logged on?)" | Out-File $MARKER -Encoding ascii
    }
} catch {
    "FAILED: $_" | Out-File -Append $LOG
    "fail: $_" | Out-File $MARKER -Encoding ascii
}
"---- END ----" | Out-File -Append $LOG
