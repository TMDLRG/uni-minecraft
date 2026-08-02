# systray_watchdog.ps1 - traffic-light systray icon + auto-restart for the UNI broadcast studio.
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; UTF-8 em-dash breaks strings).
#
# Watches: obs64.exe process, mediamtx.exe process, ports 8098 (command_center), 8443 (publisher),
#          8099 (overlay_server), 4460 (obs_bridge if present), 3020 (colony cam).
# Icon:    GREEN = all core services healthy
#          YELLOW = one non-critical service down (overlays, throttle)
#          RED = OBS or Publisher or MediaMTX down
#          "z" overlay when Idle mode is active (POST /api/idle {mode:'idle'})
#
# Right-click menu: restart each service individually, restart all, kill all, open command center,
#                    toggle idle mode, quit.
# On any service death: toast notification + auto-restart (same commands as studio_up.ps1 -Watch).
#
# Launched at the tail of studio_up.ps1 (or manually: powershell -File viewer\systray_watchdog.ps1).

$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$OBS  = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
$MTX  = 'C:\Users\mpolz\tools\mediamtx\mediamtx.exe'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Hide the console window so the tray icon is the only surface.
$sig = @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
try {
  Add-Type -MemberDefinition $sig -Name Win32Console -Namespace UniTray -PassThru | Out-Null
  $h = [UniTray.Win32Console]::GetConsoleWindow()
  if ($h -ne [IntPtr]::Zero) { [UniTray.Win32Console]::ShowWindow($h, 0) | Out-Null }
} catch {}

function Test-Port { param([int]$p) Test-NetConnection 127.0.0.1 -Port $p -WarningAction SilentlyContinue -InformationLevel Quiet }
function Node-Running { param($script) [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$script*" }) }
function Proc-Running { param($name) [bool](Get-Process -Name $name -ErrorAction SilentlyContinue) }

function New-TrayIcon {
  param([string]$color, [string]$overlay)
  $bmp = New-Object System.Drawing.Bitmap 16,16
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $c = switch ($color) {
    'green'  { [System.Drawing.Color]::FromArgb(46,204,113) }
    'yellow' { [System.Drawing.Color]::FromArgb(241,180,15)  }
    'red'    { [System.Drawing.Color]::FromArgb(255,45,85)   }
    'gray'   { [System.Drawing.Color]::FromArgb(143,163,184) }
    default  { [System.Drawing.Color]::Silver }
  }
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $c), 1, 1, 14, 14)
  $g.DrawEllipse((New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 1), 0, 0, 15, 15)
  if ($overlay) {
    $font = New-Object System.Drawing.Font 'Segoe UI', 7, ([System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
    $g.DrawString($overlay, $font, $textBrush, 3, 1)
  }
  $g.Dispose()
  $hicon = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($hicon)
  return $icon
}

# ---- restart functions -------------------------------------------------------
# P3.1 (2026-07-12): hidden auto-restart. Log file per script under $ROOT\logs\.
function Start-NodeHidden { param($title, $script)
  if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
  $base = ($script -replace '\.cjs$','' -replace '\.js$','')
  $out  = "$ROOT\logs\$base.out.log"
  $err  = "$ROOT\logs\$base.err.log"
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList "viewer\$script" -WorkingDirectory $ROOT -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
}
Set-Alias -Name Start-NodeInWindow -Value Start-NodeHidden -Scope Script -Option AllScope
function Restart-Overlay { if (-not (Node-Running 'overlay_server.cjs')) { Start-NodeHidden 'UNI OVERLAY SERVER' 'overlay_server.cjs' } }
function Restart-CC      { if (-not (Node-Running 'command_center.cjs')) { Start-NodeHidden 'UNI COMMAND CENTER' 'command_center.cjs' } }
function Restart-Pub     { if (-not (Node-Running 'publisher.cjs')) { Start-NodeHidden 'UNI SOURCE GATEWAY' 'publisher.cjs' } }
function Restart-Bridge  { if (-not (Node-Running 'obs_bridge.cjs')) {
    # only if the bridge exists on disk (Phase 2 addition)
    if (Test-Path (Join-Path $ROOT 'viewer\obs_bridge.cjs')) { Start-NodeHidden 'UNI OBS BRIDGE' 'obs_bridge.cjs' }
  }
}
function Restart-OBS {
  if (-not (Proc-Running 'obs64')) {
    Start-Process $OBS -WorkingDirectory (Split-Path $OBS) -ArgumentList '--profile','UNI','--collection','UNI','--disable-shutdown-check','--minimize-to-tray'
  }
}
function Restart-MTX {
  if (-not (Proc-Running 'mediamtx')) {
    if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
    Start-Process -WindowStyle Hidden -FilePath $MTX -ArgumentList "$ROOT\viewer\mediamtx_local.yml" -RedirectStandardOutput "$ROOT\logs\mediamtx.out.log" -RedirectStandardError "$ROOT\logs\mediamtx.err.log" | Out-Null
  }
}
function Restart-All {
  Restart-OBS; Restart-MTX; Restart-Overlay; Restart-CC; Restart-Pub; Restart-Bridge
}
function Kill-All {
  foreach ($n in 'overlay_server.cjs','command_center.cjs','publisher.cjs','obs_bridge.cjs') {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$n*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
  }
  foreach ($p in 'obs64','mediamtx') { Get-Process -Name $p -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false }
}

# ---- health probe ------------------------------------------------------------
function Probe-Health {
  $obs = Proc-Running 'obs64'
  $mtx = Proc-Running 'mediamtx'
  $cc  = Test-Port 8098
  $pub = Test-Port 8443
  $ovl = Test-Port 8099
  $col = Test-Port 3020
  $core = $obs -and $mtx -and $cc -and $pub
  $warn = -not $ovl -or -not $col
  $color = 'red'
  if ($core) { $color = if ($warn) { 'yellow' } else { 'green' } }
  # idle mode: /api/state.idle == true (WS1-L). Best-effort HTTP probe with 1s timeout.
  $idle = $false
  try {
    $req = [System.Net.WebRequest]::Create('http://127.0.0.1:8098/api/state')
    $req.Timeout = 1500
    $r = $req.GetResponse()
    $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    $body = $sr.ReadToEnd()
    $sr.Close(); $r.Close()
    if ($body -match '"idle"\s*:\s*true') { $idle = $true }
  } catch {}
  return @{ obs=$obs; mtx=$mtx; cc=$cc; pub=$pub; ovl=$ovl; col=$col; color=$color; idle=$idle }
}
function Health-Summary { param($h)
  $lines = @()
  $lines += "OBS process        : $(if ($h.obs)  {'UP'} else {'DOWN'})"
  $lines += "MediaMTX process   : $(if ($h.mtx)  {'UP'} else {'DOWN'})"
  $lines += "Command Center 8098: $(if ($h.cc)   {'UP'} else {'DOWN'})"
  $lines += "Publisher     8443 : $(if ($h.pub)  {'UP'} else {'DOWN'})"
  $lines += "Overlay Srv   8099 : $(if ($h.ovl)  {'UP'} else {'DOWN'})"
  $lines += "Colony cam    3020 : $(if ($h.col)  {'UP'} else {'DOWN'})"
  $lines += "Idle mode          : $(if ($h.idle) {'ON'} else {'off'})"
  return ($lines -join "`n")
}

# ---- tray icon + menu --------------------------------------------------------
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Text = 'UNI Studio - initializing'
$tray.Icon = New-TrayIcon 'gray' $null
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
function Add-Menu { param($text, $onClick)
  $item = $menu.Items.Add($text)
  if ($onClick) { $item.Add_Click($onClick) } else { $item.Enabled = $false }
  return $item
}
$statusItem = Add-Menu 'UNI Studio' $null
Add-Menu '-' $null | Out-Null
Add-Menu 'Open Command Center' {
  # Prefer chrome --app so it appears as its own window (matches auto-open at bring-up).
  if(-not (Test-Path "$ROOT\chrome-profiles\command")){ New-Item -ItemType Directory -Path "$ROOT\chrome-profiles\command" -Force | Out-Null }
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if(-not (Test-Path $chrome)){ $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if(Test-Path $chrome){
    Start-Process -FilePath $chrome -ArgumentList '--app=http://127.0.0.1:8098/','--window-size=1600,1000','--window-position=160,80',"--user-data-dir=$ROOT\chrome-profiles\command"
  } else {
    Start-Process 'http://127.0.0.1:8098/'
  }
} | Out-Null
Add-Menu 'Show Logs' { if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }; Start-Process explorer.exe -ArgumentList "$ROOT\logs" } | Out-Null
Add-Menu 'Show Status'  { [System.Windows.Forms.MessageBox]::Show((Health-Summary (Probe-Health)), 'UNI Studio status') | Out-Null } | Out-Null
Add-Menu '-' $null | Out-Null
Add-Menu 'Restart All'          { Restart-All } | Out-Null
Add-Menu 'Restart OBS'          { Restart-OBS } | Out-Null
Add-Menu 'Restart MediaMTX'     { Restart-MTX } | Out-Null
Add-Menu 'Restart Command Ctr'  { Restart-CC } | Out-Null
Add-Menu 'Restart Publisher'    { Restart-Pub } | Out-Null
Add-Menu 'Restart Overlay Srv'  { Restart-Overlay } | Out-Null
Add-Menu 'Restart OBS Bridge'   { Restart-Bridge } | Out-Null
Add-Menu '-' $null | Out-Null
Add-Menu 'Toggle Idle Mode' {
  try {
    $req = [System.Net.WebRequest]::Create('http://127.0.0.1:8098/api/state')
    $r = $req.GetResponse(); $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    $body = $sr.ReadToEnd(); $sr.Close(); $r.Close()
    $isIdle = $body -match '"idle"\s*:\s*true'
    $target = if ($isIdle) { 'active' } else { 'idle' }
    $req2 = [System.Net.WebRequest]::Create('http://127.0.0.1:8098/api/idle')
    $req2.Method = 'POST'
    $req2.ContentType = 'application/json'
    $req2.Headers.Add('x-uni-cc', '1')
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("{`"mode`":`"$target`"}")
    $req2.ContentLength = $bytes.Length
    $s = $req2.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
    $req2.GetResponse().Close()
  } catch {}
} | Out-Null
Add-Menu '-' $null | Out-Null
Add-Menu 'Kill All' { Kill-All } | Out-Null
Add-Menu 'Quit Watchdog' { $tray.Visible = $false; [System.Windows.Forms.Application]::Exit() } | Out-Null
$tray.ContextMenuStrip = $menu

# ---- OBS dialog dismisser (P3.9 - crash-dialog blocker for tray-only) --------
# Enumerates ALL top-level windows; if any title matches OBS's safe-mode / crash /
# auto-config dialog AND belongs to obs64, sends Enter to dismiss (Enter = default action =
# "Launch Normally" on the safe-mode prompt, "Cancel" on auto-config).
Add-Type -AssemblyName System.Windows.Forms
if (-not ('UNIWatchdog.Win32' -as [type])) {
  Add-Type -Namespace UNIWatchdog -Name Win32 -MemberDefinition @'
    public delegate bool EnumWindowsProc(System.IntPtr hWnd, System.IntPtr lParam);
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, System.IntPtr lParam);
    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Auto)] public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hWnd);
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
'@
}
function Dismiss-OBSDialogs {
  $obsPids = @(Get-Process obs64 -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  if ($obsPids.Count -eq 0) { return }
  $hits = New-Object System.Collections.ArrayList
  $cb = [UNIWatchdog.Win32+EnumWindowsProc]{
    param($h, $l)
    if ([UNIWatchdog.Win32]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 256
      [UNIWatchdog.Win32]::GetWindowText($h, $sb, 256) | Out-Null
      $title = $sb.ToString()
      if ($title -match 'Safe Mode|Crash|Auto-Configuration|Missing Files|Uncommitted') {
        $pid = 0
        [UNIWatchdog.Win32]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
        if ($obsPids -contains [int]$pid) { [void]$hits.Add(@{ h = $h; title = $title }) }
      }
    }
    return $true
  }
  [UNIWatchdog.Win32]::EnumWindows($cb, [System.IntPtr]::Zero) | Out-Null
  foreach ($hit in $hits) {
    [UNIWatchdog.Win32]::ShowWindowAsync($hit.h, 9) | Out-Null   # SW_RESTORE
    [UNIWatchdog.Win32]::SetForegroundWindow($hit.h) | Out-Null
    Start-Sleep -Milliseconds 250
    # Enter = default (Launch Normally / Continue / etc). Balloon-notify the operator.
    [System.Windows.Forms.SendKeys]::SendWait('~')
    $tray.ShowBalloonTip(3000, 'UNI Studio', "dismissed OBS dialog: $($hit.title)", [System.Windows.Forms.ToolTipIcon]::Info)
  }
}

# ---- watchdog + icon-refresh timer ------------------------------------------
$state = @{ lastColor = ''; lastIdle = $false; downSince = @{} }

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
  # P3.9: dismiss any OBS safe-mode / crash / auto-config dialog before anything else.
  try { Dismiss-OBSDialogs } catch {}
  $h = Probe-Health
  # Auto-restart any dead service that was up last cycle. Only restart after 10s of down
  # to avoid ping-pong on brief hiccups.
  $now = Get-Date
  foreach ($k in @('cc','pub','ovl')) {
    if (-not $h.$k) {
      if (-not $state.downSince.ContainsKey($k)) { $state.downSince[$k] = $now }
      elseif (($now - $state.downSince[$k]).TotalSeconds -gt 10) {
        switch ($k) {
          'cc'  { Restart-CC }
          'pub' { Restart-Pub }
          'ovl' { Restart-Overlay }
        }
        $tray.ShowBalloonTip(4000, 'UNI Studio', "restarted $k after being DOWN >10s", [System.Windows.Forms.ToolTipIcon]::Warning)
        $state.downSince.Remove($k) | Out-Null
      }
    } else {
      $state.downSince.Remove($k) | Out-Null
    }
  }
  # Icon + tooltip
  $overlay = if ($h.idle) { 'z' } else { $null }
  if ($state.lastColor -ne $h.color -or $state.lastIdle -ne $h.idle) {
    try { $tray.Icon.Dispose() } catch {}
    $tray.Icon = New-TrayIcon $h.color $overlay
    $state.lastColor = $h.color
    $state.lastIdle = $h.idle
  }
  $tray.Text = "UNI Studio - $($h.color.ToUpper())$(if($h.idle){' (idle)'})"
})
$timer.Start()

# Force an initial probe
$timer_tick_now = $timer.GetType().GetMethod('OnTick', [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic)
if ($timer_tick_now) { $timer_tick_now.Invoke($timer, @([System.EventArgs]::Empty)) }

# Message loop.
[System.Windows.Forms.Application]::Run()
$tray.Visible = $false
$tray.Dispose()
