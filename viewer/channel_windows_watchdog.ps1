# channel_windows_watchdog.ps1 - keep the OBS window-capture CHANNEL WINDOWS alive.
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; a UTF-8 dash breaks strings).
#
# WHY THIS EXISTS (2026-08-03, 16h into a 25h run).
# cap_overlook and cap_colony are OBS *window_capture* sources. They capture two real Chrome
# windows by exact title:
#     cap_overlook -> "Stratified Palimpsest - Overlooker"   (:4200/stream, the UNI PRODUCER page)
#     cap_colony   -> "Prismarine Viewer"                    (:3020, the world camera)
# They are real Chrome windows and not OBS browser sources on purpose: OBS's CEF renders their
# WebGL to a BLACK frame, a real Chrome window renders both the WebGL camera and the HTML cards.
#
# The operator closed those windows and the colony overview went black on air. Nothing noticed:
# systray_watchdog.ps1 supervises OBS / MediaMTX / command_center / publisher / overlay_server,
# and door_watchdog.ps1 supervises launcher.cjs + door_healer.cjs, but NOTHING supervised these
# two Chrome windows. A window_capture whose target window does not exist captures pure black and
# reports no error anywhere.
#
# WHAT IT DOES, AND DELIBERATELY NOTHING MORE.
#   * every $IntervalSec, look for each channel's Chrome process BY ITS PROFILE TAG
#     (--user-data-dir=...\ch_overlook), never by a global title search -- so the operator's own
#     Chrome and the command-center window can never be matched, let alone killed.
#   * if a channel's process is ABSENT, relaunch it with the exact argument list
#     studio_channels.ps1 uses for that channel.
#   * PAGE LIVENESS (added 2026-08-03): if the process is PRESENT, ask the page whether it is
#     actually alive, via viewer\channel_probe.cjs over CDP. If it is DEAD *and* its OBS source is
#     NOT on program, reload it. See Ensure-PageAlive for the three fences.
#   * WINDOW CAPTURABILITY (added 2026-08-04): if the process is PRESENT, ask WINDOWS whether the
#     window is in a state Windows Graphics Capture can actually read. Minimized or hidden -> it
#     cannot, and OBS captures pure black. Restore it. See Ensure-WindowCapturable.
#   * it NEVER kills anything, NEVER touches OBS, NEVER changes a scene, NEVER writes channels.json.
#     Its blast radius is "a Chrome window may get opened, restored to its parked off-screen
#     position, or an OFF-AIR page may get reloaded".
#
# WHY PAGE LIVENESS HAD TO BE ADDED, in one line: a live Chrome process whose page has died to
# "Aw, Snap!" is PRESENT, so the process check above returns healthy for it -- and on 2026-08-03
# that state went to air, white, scoring a perfect frac=1.0 on the only pixel check the studio has.
#
# WHY WINDOW CAPTURABILITY HAD TO BE ADDED, and it is a THIRD independent instrument.
# On 2026-08-04, cap_overlook captured black for hours after a crash/reboot cycle while EVERY
# existing check said healthy: the process was present, the page was perfectly alive (a CDP
# screenshot of it came back 106 KB of fully rendered producer view), and the OBS source was
# enabled and on program. The window had been left MINIMIZED, and Windows Graphics Capture cannot
# capture a minimized window -- it returns black, silently, forever. Nothing in this file could
# see that, because the renderer is what CDP talks to and the renderer renders fine while
# minimized. Only the Win32 WINDOW state reveals it. Process existence, page liveness and window
# capturability are three different questions and a green answer to two of them proves nothing
# about the third.
#
# THE TRAP, measured before this was written: the channel windows are parked at
# --window-position=-32000,-32000, which is the SAME coordinate Windows parks a minimized window
# at. So GetWindowRect CANNOT distinguish "deliberately off-screen and healthy" from "minimized
# and black" -- a rect-based check would convict every healthy channel window. IsIconic() is the
# only honest signal and is what this uses.
#
# ANTI-STORM. CLAUDE.md records a real window-spawn storm (2026-07-14) caused by a polled path that
# actuated. This script is a pure observer that acts only on a *transition to absent*, and it
# additionally refuses to relaunch the same channel more often than $MinRelaunchSec (default 90s).
# If a channel is crash-looping, it backs off rather than machine-gunning Chrome. Every launch and
# every refusal is logged.
#
#   powershell -File viewer\channel_windows_watchdog.ps1              # supervise forever (20s)
#   powershell -File viewer\channel_windows_watchdog.ps1 -Once        # one check, then exit
#   powershell -File viewer\channel_windows_watchdog.ps1 -ProveWindow # mutation-prove the window
#                                                                    # detector on a THROWAWAY
#                                                                    # window; touches no channel
param([switch]$Once, [switch]$ProveWindow, [int]$IntervalSec = 20, [int]$MinRelaunchSec = 90,
      [int]$MinReloadSec = 300, [int]$MinRestoreSec = 60)

$ErrorActionPreference = 'SilentlyContinue'
$ROOT   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG    = Join-Path $LOGDIR 'channel_windows_watchdog.log'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

function Write-Log([string]$m) {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  "$ts $m" | Out-File -FilePath $LOG -Append -Encoding utf8
}

# Same anti-throttle flag set studio_channels.ps1 uses, so a relaunched window behaves identically
# to one the canonical launcher produced (off-screen windows must not be occlusion-throttled).
$anti = @('--ignore-gpu-blocklist','--enable-gpu-rasterization','--use-angle=d3d11',
  '--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding','--disable-background-timer-throttling',
  '--no-first-run','--disable-infobars','--disable-session-crashed-bubble')

# The channels this watchdog owns. URLs are BY NAME (uni-lab.local), never an IP literal: the
# chip's LAN address is a DHCP lease and moves. Keep in sync with viewer\studio_channels.ps1.
#
# port/match/expect/source are for the PAGE-LIVENESS check (added 2026-08-03):
#   port   - the CDP debug port studio_channels.ps1 launches this channel with
#   match  - substring identifying this channel's page target in /json/list
#   expect - a selector that MUST exist once the app has really rendered. This is the strong
#            signal: it asserts the page is not merely *a* page but *the right* page, rendered.
#            colony (:3020) is a prismarine-viewer -> <canvas>.  overlook (:4200/stream) composes
#            the world in an <iframe> plus cards.
#   source - the OBS source this channel feeds, used to check whether it is ON PROGRAM
$channels = @(
  @{ key='overlook'; tag='ch_overlook'; url='http://uni-lab-lan.uni-lab.local:4200/stream'; cdp='--remote-debugging-port=9221';
     port=9221; match='stream'; expect='iframe'; source='cap_overlook' },
  @{ key='colony';   tag='ch_colony';   url='http://uni-lab-lan.uni-lab.local:3020/';       cdp='--remote-debugging-port=9220';
     port=9220; match='3020';   expect='canvas'; source='cap_colony' }
)

function Browser-Proc($tag) {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like "*$tag*" -and $_.CommandLine -notlike '*--type=*' } |
    Select-Object -First 1
}

# ---- WINDOW CAPTURABILITY (added 2026-08-04) -------------------------------------------------
# The one question neither the process check nor the page probe can answer: can Windows Graphics
# Capture actually READ this window? A minimized window cannot be captured by WGC -- it hands OBS
# a black frame and reports no error. A hidden window (WS_VISIBLE clear) is the same class of
# fault and takes the same repair, so both are handled here.
$SW_SHOWNOACTIVATE = 4      # show at last size/position WITHOUT activating -- never steals focus
$SW_MINIMIZE       = 6      # used only by -ProveWindow, only ever on a throwaway window
$SWP_QUIET         = 0x0015 # NOSIZE | NOZORDER | NOACTIVATE
$PARK_X            = -32000 # the position studio_channels.ps1 and Ensure-Channel launch with
$PARK_Y            = -32000

$winSig = @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
'@
if (-not ('ChanWin.U' -as [type])) { Add-Type -Namespace ChanWin -Name U -MemberDefinition $winSig }

function Get-ChannelHwnd($proc) {
  if (-not $proc) { return [IntPtr]::Zero }
  $p = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { return [IntPtr]::Zero }
  return $p.MainWindowHandle
}

# OK | MINIMIZED | HIDDEN | NO_HANDLE. NO_HANDLE is UNKNOWN, never a fault -- same rule the page
# probe follows. Note there is deliberately NO rect test: see THE TRAP in the header.
function Get-WindowState([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero)                 { return 'NO_HANDLE' }
  if ([ChanWin.U]::IsIconic($h))             { return 'MINIMIZED' }
  if (-not [ChanWin.U]::IsWindowVisible($h)) { return 'HIDDEN' }
  return 'OK'
}

function Get-WindowRectStr([IntPtr]$h) {
  $r = New-Object 'ChanWin.U+RECT'
  [void][ChanWin.U]::GetWindowRect($h, [ref]$r)
  return "$($r.L),$($r.T)"
}

# The repair primitive. SW_SHOWNOACTIVATE, never SW_RESTORE: SW_RESTORE ACTIVATES the window, which
# on a live studio box would yank focus away from the operator mid-show.
# A restored window normally returns to its parked position, but if Windows relocates it onto a
# real monitor it would be sitting in the operator's face, so the launcher's parked position is
# re-asserted. That reposition happens ONLY as part of this repair -- a healthy window is never
# moved.
function Restore-Window([IntPtr]$h) {
  [void][ChanWin.U]::ShowWindow($h, $SW_SHOWNOACTIVATE)
  Start-Sleep -Milliseconds 250
  $r = New-Object 'ChanWin.U+RECT'
  [void][ChanWin.U]::GetWindowRect($h, [ref]$r)
  $reparked = $false
  if ($r.L -gt -20000 -or $r.T -gt -20000) {
    [void][ChanWin.U]::SetWindowPos($h, [IntPtr]::Zero, $PARK_X, $PARK_Y, 0, 0, $SWP_QUIET)
    Start-Sleep -Milliseconds 100
    $reparked = $true
  }
  return @{ state = (Get-WindowState $h); rect = (Get-WindowRectStr $h); reparked = $reparked }
}

$lastRestore = @{}
function Ensure-WindowCapturable($ch) {
  $h = Get-ChannelHwnd (Browser-Proc $ch.tag)
  $state = Get-WindowState $h

  if ($state -eq 'OK') { return }
  if ($state -eq 'NO_HANDLE') {
    Write-Log "WIN $($ch.key) NO_HANDLE - cannot tell, taking NO action"
    return
  }

  # DELIBERATELY NO ON-AIR FENCE, and this is the opposite call to the one Ensure-PageAlive makes.
  # A reload DESTROYS what is on air (it blanks the terrain), so it is fenced. A restore can only
  # ADD picture: the source is already black BECAUSE the window is minimized, so refusing to repair
  # it while on program would mean refusing to fix a black frame precisely when it is being
  # broadcast. This is the same inversion systray_watchdog.ps1 uses for the fan-out, for the same
  # reason: "down" already means the audience has lost it.
  $now = Get-Date
  if ($lastRestore.ContainsKey($ch.key)) {
    $since = ($now - $lastRestore[$ch.key]).TotalSeconds
    if ($since -lt $MinRestoreSec) {
      # Something outside this script is re-minimizing the window. Back off rather than fight it,
      # and say so loudly -- a watchdog silently losing a tug-of-war looks identical to a healthy one.
      Write-Log "WIN $($ch.key) $state again but restored $([int]$since)s ago (< $MinRestoreSec) - backing off. SOMETHING ELSE IS MINIMIZING IT."
      return
    }
  }

  $res = Restore-Window $h
  $lastRestore[$ch.key] = $now
  $rp = if ($res.reparked) { ' (re-parked off-screen)' } else { '' }
  Write-Log "WIN $($ch.key) was $state -> restored, now $($res.state) at $($res.rect)$rp. $($ch.source) was capturing BLACK."
}

# ---- PAGE LIVENESS (added 2026-08-03) -------------------------------------------------------
# Process existence was never enough. A live Chrome process whose page died to "Aw, Snap!" is
# PRESENT, so Ensure-Channel below returns healthy for it -- and that exact state went to air.
# OBS kept capturing the crash page, the source stayed ENABLED, and the render check said
# rendering=true frac=1, because frac measures NON-BLACK and a Chrome error page is WHITE.
#
# viewer\channel_probe.cjs does the check in ONE synchronous DOM query -- no rAF, no timing loop,
# no screenshot -- because probing these WebGL pages heavily is measurably what kills the platform
# pushers on this box. Exit 0 ALIVE, 1 DEAD, 2 UNKNOWN.

# Which picture sources are enabled on the PROGRAM scene right now.
# Returns $null when it cannot tell -- and $null is treated as ON AIR by the caller, deliberately.
function Get-ProgramSources {
  try {
    $req = [System.Net.WebRequest]::Create('http://127.0.0.1:8098/api/state')
    $req.Timeout = 2500
    $r  = $req.GetResponse()
    $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    $body = $sr.ReadToEnd(); $sr.Close(); $r.Close()
    $m = [regex]::Match($body, '"pictureSources"\s*:\s*\[(.*?)\]')
    if (-not $m.Success) { return $null }
    return @([regex]::Matches($m.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
  } catch { return $null }
}

function Probe-Page($ch) {
  $probe = Join-Path $ROOT 'viewer\channel_probe.cjs'
  if (-not (Test-Path $probe)) { return @{ verdict='NO_PROBE'; code=2 } }
  $out = & node $probe $ch.port $ch.match $ch.expect 2>$null
  $code = $LASTEXITCODE
  $v = if ($out) { ([string]($out | Select-Object -First 1)).Trim() } else { 'NO_OUTPUT' }
  return @{ verdict=$v; code=$code }
}

$lastReload = @{}
function Ensure-PageAlive($ch) {
  $p = Probe-Page $ch

  # UNKNOWN is not DEAD. A probe that cannot connect must never be actioned as a fault -- reloading
  # a healthy page because an instrument failed is worse than the fault being hunted.
  if ($p.code -ne 1) {
    if ($p.verdict -ne 'ALIVE') { Write-Log "PAGE $($ch.key) $($p.verdict) - cannot tell, taking NO action" }
    return
  }

  # ON-AIR FENCE. Reloading a source that is on program puts a blank frame in front of the
  # audience. Worse, on these pages a reload after the camera's bot has settled BLANKS THE TERRAIN
  # -- ui/lib/sp_ui_web/live/stream_live.ex:263-265 says it outright: "we never reset an
  # already-rendering view (which blanks the terrain)". A dead page on air is the operator's call,
  # not a timer's; we log loudly and leave it.
  $prog = Get-ProgramSources
  if ($null -eq $prog) {
    Write-Log "PAGE $($ch.key) DEAD ($($p.verdict)) but program scene UNKNOWN - refusing to reload (fail safe)"
    return
  }
  if ($prog -contains $ch.source) {
    Write-Log "PAGE $($ch.key) DEAD ($($p.verdict)) and $($ch.source) is ON PROGRAM - refusing to reload. OPERATOR ACTION NEEDED."
    return
  }

  # Rate limit hard. A reload is expensive on these pages, and a reload loop is how the world view
  # was lost for hours on 2026-08-03.
  $now = Get-Date
  if ($lastReload.ContainsKey($ch.key)) {
    $since = ($now - $lastReload[$ch.key]).TotalSeconds
    if ($since -lt $MinReloadSec) {
      Write-Log "PAGE $($ch.key) DEAD ($($p.verdict)) but reloaded $([int]$since)s ago (< $MinReloadSec) - backing off"
      return
    }
  }

  $reload = Join-Path $ROOT 'viewer\channel_reload.cjs'
  if (-not (Test-Path $reload)) { Write-Log "PAGE $($ch.key) DEAD ($($p.verdict)) but channel_reload.cjs missing"; return }
  & node $reload $ch.port $ch.match | Out-Null
  $lastReload[$ch.key] = $now
  Write-Log "PAGE $($ch.key) DEAD ($($p.verdict)) OFF-AIR -> reloaded via CDP $($ch.port)"
}

$lastLaunch = @{}
function Ensure-Channel($ch) {
  $p = Browser-Proc $ch.tag
  if ($p) { return $true }
  $now = Get-Date
  if ($lastLaunch.ContainsKey($ch.key)) {
    $since = ($now - $lastLaunch[$ch.key]).TotalSeconds
    if ($since -lt $MinRelaunchSec) {
      Write-Log "HOLD $($ch.key) absent but relaunched $([int]$since)s ago (< $MinRelaunchSec) - backing off, not spawning"
      return $false
    }
  }
  $a = @("--app=$($ch.url)", "--user-data-dir=C:\Users\mpolz\AppData\Local\Temp\$($ch.tag)",
         '--window-size=1920,1080','--window-position=-32000,-32000', $ch.cdp) + $anti
  Start-Process -FilePath $chrome -ArgumentList $a
  $lastLaunch[$ch.key] = $now
  Write-Log "RELAUNCH $($ch.key) was ABSENT -> started $($ch.url)"
  return $true
}

# A window that was JUST relaunched is still loading, so it is never page-probed on the same pass --
# it gets its first liveness check one interval later, once it has had time to render.
function Sweep-Channels {
  foreach ($ch in $channels) {
    $wasPresent = [bool](Browser-Proc $ch.tag)
    Ensure-Channel $ch | Out-Null
    if ($wasPresent) {
      # Window state first: it is a cheap local Win32 read, and a minimized window is black RIGHT
      # NOW. The page probe is the expensive one and it is independent -- a page can be perfectly
      # alive inside a window OBS cannot see, which is exactly the 2026-08-04 failure.
      Ensure-WindowCapturable $ch
      Ensure-PageAlive $ch
    }
  }
}

# ---- -ProveWindow: the window detector must be shown to BITE ---------------------------------
# A detector that has never returned its new verdict is not evidence. This drives the real
# Get-WindowState / Restore-Window used above through MINIMIZED -> OK on a THROWAWAY window with
# its own profile tag and no OBS source, so no channel and no capture is ever touched.
if ($ProveWindow) {
  $fail = 0
  function Check($label, $got, $want) {
    if ("$got" -eq "$want") { "PASS $label ($got)" } else { "FAIL $label got=$got want=$want"; $script:fail++ }
  }
  $tag = 'ch_prove'
  $a = @('--app=about:blank', "--user-data-dir=C:\Users\mpolz\AppData\Local\Temp\$tag",
         '--window-size=800,600', "--window-position=$PARK_X,$PARK_Y") + $anti
  $sp = Start-Process -FilePath $chrome -ArgumentList $a -PassThru
  try {
    $h = [IntPtr]::Zero
    for ($i = 0; $i -lt 40 -and $h -eq [IntPtr]::Zero; $i++) {
      Start-Sleep -Milliseconds 250
      $h = Get-ChannelHwnd (Browser-Proc $tag)
    }
    if ($h -eq [IntPtr]::Zero) { 'FAIL throwaway window never produced a handle'; exit 1 }
    Check 'healthy window reads OK' (Get-WindowState $h) 'OK'

    # THE MUTATION: minimize it. If the detector cannot see this, nothing has been fixed.
    [void][ChanWin.U]::ShowWindow($h, $SW_MINIMIZE)
    Start-Sleep -Milliseconds 400
    Check 'minimized window reads MINIMIZED' (Get-WindowState $h) 'MINIMIZED'

    # And the parked rect must NOT be what convicts it -- prove the trap is really there, so nobody
    # "simplifies" this back to a rect test later.
    $rect = Get-WindowRectStr $h
    Check 'minimized rect is indistinguishable from parked' $rect "$PARK_X,$PARK_Y"

    $res = Restore-Window $h
    Check 'repair returns it to OK' $res.state 'OK'
    Check 'repair leaves it parked off-screen' $res.rect "$PARK_X,$PARK_Y"
  } finally {
    if ($sp) { Stop-Process -Id $sp.Id -Force -ErrorAction SilentlyContinue }
    Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
      Where-Object { $_.CommandLine -like "*$tag*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  if ($fail -gt 0) { "PROVE FAILED ($fail)"; exit 1 }
  'PROVE OK - the window detector bites'
  exit 0
}

if ($Once) {
  foreach ($ch in $channels) {
    $ok  = Ensure-Channel $ch
    $h   = Get-ChannelHwnd (Browser-Proc $ch.tag)
    $w   = Get-WindowState $h
    $p   = Probe-Page $ch
    Write-Log "-Once $($ch.key) present=$ok win=$w page=$($p.verdict)"
    "$($ch.key): process=$(if($ok){'present'}else{'absent'}) win=$w page=$($p.verdict)"
  }
  exit 0
}

# ---- QUIET-MODE LATCH (added 2026-08-10) --------------------------------------------------------
# THIS WATCHDOG IS THE MEASURED HOLE IN "STOP ALL", and that is why the guard lives here.
# studio_up.ps1 -Stop's Kill-Everything matches only systray_watchdog.ps1 and the Phoenix/Minecraft
# wrapper shells among powershell processes, so THIS script survives a full stop (measured 2026-08-10,
# PID 22320) and its whole job is to notice an absent channel window and relaunch it. The Chrome
# channel windows were measured at 24 processes / 6,058 MB - the single largest consumer on the box.
# So before this guard, "stop everything" stopped everything EXCEPT the heaviest thing, which came
# straight back within one sweep. The stop EXISTED; the stop did not HAPPEN.
#
# A deliberate off state is not a fault. In QUIET the channel windows are SUPPOSED to be gone.
# FAILSAFE: any read/parse failure returns $false (NOT quiet), so a corrupt latch can never silently
# keep the studio's windows down before a show. Same direction as quiet_mode.cjs; the opposite of
# door_healer's, and deliberately so - see the header of viewer/quiet_mode.cjs.
function Test-QuietMode {
  try {
    $latch = Join-Path $PSScriptRoot 'runtime\quiet_mode.json'
    if (-not (Test-Path $latch)) { return $false }
    $j = Get-Content -LiteralPath $latch -Raw -ErrorAction Stop | ConvertFrom-Json
    return [bool]$j.quiet
  } catch { return $false }
}

Write-Log "channel_windows_watchdog started (interval ${IntervalSec}s, min-relaunch ${MinRelaunchSec}s, min-reload ${MinReloadSec}s, min-restore ${MinRestoreSec}s, channels: $(($channels|ForEach-Object{$_.key}) -join ','))"
$script:quietAnnounced = $false
while ($true) {
  if (Test-QuietMode) {
    # Log the TRANSITION only. Logging every sweep would write a line every $IntervalSec for as long
    # as the operator leaves the box quiet - hours or days - and bury the real events in the log.
    if (-not $script:quietAnnounced) {
      Write-Log "QUIET MODE latched (runtime\quiet_mode.json) - standing down. Channel windows are deliberately absent; NOT relaunching. Will resume sweeping automatically when the latch clears."
      $script:quietAnnounced = $true
    }
  } else {
    if ($script:quietAnnounced) {
      Write-Log "QUIET MODE cleared - resuming channel sweeps."
      $script:quietAnnounced = $false
    }
    Sweep-Channels
  }
  Start-Sleep -Seconds $IntervalSec
}
