# studio_up.ps1 - ONE command that brings the whole UNI broadcast studio up, in order, with
# health gating. Idempotent: anything already running is reused. ASCII-only (PS 5.1 reads
# BOM-less files as ANSI). Run:
#     powershell -File viewer\studio_up.ps1            # bring the stack up
#     powershell -File viewer\studio_up.ps1 -Watch     # bring up, then watchdog the node servers
#     powershell -File viewer\studio_up.ps1 -Status    # report what's up / down (incl. zombies)
#     powershell -File viewer\studio_up.ps1 -Stop      # tear EVERYTHING down, verified
#
# Order (each step waits for the previous to be healthy):
#   Minecraft -> Phoenix(:4000)+/stream -> colony cam(:3020) -> OBS(:4455) -> channels+throttle
#   -> overlay_server(:8099) -> mediamtx(:9997) -> studio_stage -> command_center(:8098)
#   -> publisher gateway(:8443) -> systray watchdog
#
# -Stop: kills EVERYTHING this script can start -- Minecraft, Phoenix (ui/), OBS, MediaMTX, every
#        node child, the systray watchdog, and the colony/glass Chrome captures -- then verifies
#        nothing is left and reports PASS/FAIL. Refuses when OBS is actively streaming unless
#        -Force is also passed (checks MediaMTX's uni.ready, not a value the app can fake false).
#
# ZOMBIE-NODE GUARD: bring-up checks the actual PROCESS (erl.exe with -sname uni / java.exe with
# paper.jar), not just the port. A prior Phoenix node whose web server died but whose BEAM process
# is still alive would pass the old "is :4000 up" check as false and get a SECOND node started
# alongside it -- two processes both claiming --sname uni. This has actually happened; the guard
# below refuses to start a duplicate and tells the operator to run -Stop first.
param([switch]$Watch,[switch]$Status,[switch]$Stop,[switch]$Force,[switch]$HostColony,[switch]$MutexProbe)
$ErrorActionPreference='SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$OBS='C:\Program Files\obs-studio\bin\64bit\obs64.exe'
$MTX='C:\Users\mpolz\tools\mediamtx\mediamtx.exe'

function Test-Port($p){ Test-NetConnection 127.0.0.1 -Port $p -WarningAction SilentlyContinue -InformationLevel Quiet }
function Wait-Port($p,$name,$max){
  $n=0; while(-not (Test-Port $p)){ Start-Sleep 2; $n+=2; if($n -ge $max){ "  TIMEOUT waiting for $name (:$p) after ${max}s"; return $false } }
  "  OK $name (:$p)"; return $true
}
function Node-Running($script){ [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$script*" }) }
# P3.1 (2026-07-12): tray-only bring-up. Direct-spawn node.exe hidden with logs redirected to
# $ROOT\logs\ so nothing pops a visible console. The old -NoExit powershell wrapper (5 visible
# windows total across the bring-up) is gone. Watch a live log via the systray icon or:
#   Get-Content $ROOT\logs\command_center.out.log -Wait
function Start-NodeHidden($title,$script,$nodeArgs){
  if(Node-Running $script){ "  reuse $script"; return }
  if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
  $base = ($script -replace '\.cjs$','' -replace '\.js$','')
  $out  = "$ROOT\logs\$base.out.log"
  $err  = "$ROOT\logs\$base.err.log"
  # $nodeArgs added 2026-08-02: obs_supervisor needs --watch, and without a way to pass a flag the
  # only options were a second copy of this function or a resident service that never supervises.
  $argList = @("viewer\$script"); if($nodeArgs){ $argList += $nodeArgs }
  Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList $argList -WorkingDirectory $ROOT -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  "  started $script $nodeArgs (hidden; logs -> $out)"
}
# Back-compat alias so any lingering caller still works.
Set-Alias -Name Start-NodeWindow -Value Start-NodeHidden -Scope Script -Option AllScope
# Process-level (not port-level) checks -- these are what catch a zombie / duplicate.
function Phoenix-Procs(){ Get-CimInstance Win32_Process -Filter "Name='erl.exe' OR Name='beam.smp.exe' OR Name='werl.exe'" | Where-Object { $_.CommandLine -like '*-sname*uni*' -or $_.CommandLine -like '*--sname*uni*' } }
function Minecraft-Procs(){ Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -like '*paper.jar*' } }
function Wrapper-Procs(){ Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*phx.server*' -or $_.CommandLine -like '*paper.jar*' -or $_.CommandLine -like '*iex.bat*' -or $_.CommandLine -like '*elixir.bat*' } }

function Kill-Everything(){
  $killed = @()
  # ORDER IS LOAD-BEARING (2026-07-12 audit fix). The per-UNI body.js bots are OS-Port children of
  # the RESTART-SAFE Phoenix supervisor (SP.Show). If we reap body.js while that supervisor is still
  # alive, it RESPAWNS them, and they are orphaned the instant the node finally dies -- the exact
  # recurring phantom-MC-player bug (131 orphans observed 2026-07-12). So kill the parent supervisor
  # FIRST, THEN sweep its now-parentless children. This makes the first pass authoritative.
  # 1) systray watchdog FIRST (else it auto-restarts the node servers we are about to kill).
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*systray_watchdog.ps1*" -and $_.ProcessId -ne $PID } | ForEach-Object { "  kill systray_watchdog PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false; $killed += 'watchdog' }
  # 2) Phoenix (ui/ colony node) BEFORE its body.js children -- ALL matching -sname uni processes
  #    (a prior session can leave a duplicate). With the supervisor dead, nothing can respawn a body.
  Phoenix-Procs | ForEach-Object { "  kill phoenix($($_.Name)) PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false; $killed += 'phoenix' }
  # 3) Minecraft (the world the bodies inhabit)
  Minecraft-Procs | ForEach-Object { "  kill minecraft(java) PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false; $killed += 'minecraft' }
  Start-Sleep -Milliseconds 400   # let the BEAM supervisor actually exit before reaping its Ports
  # 4) node children -- studio servers AND the now-parentless Elixir-node Port children (camera
  #    director.js + per-UNI body.js bots + colony throttle). Supervisor is already dead (step 2),
  #    so these cannot respawn -- this reap is authoritative on the first pass.
  # dual_push owns two ffmpeg children; ask it to stop them cleanly first, so the reap below is not
  # racing orphaned pushers still holding sockets to YouTube/Twitch.
  try { & node "$ROOT\viewer\dual_push.cjs" --stop 2>&1 | Out-Null } catch {}
  foreach($n in 'overlay_server.cjs','command_center.cjs','publisher.cjs','obs_supervisor.cjs','dual_push.cjs','health_ticker.cjs','music_director.cjs','voice_server.cjs','obs_bridge.cjs','lan_broadcast.cjs','director.js','body.js','throttle_colony.cjs'){
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$n*" } | ForEach-Object { "  kill $n PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false; $killed += $n }
  }
  # 5) OBS + MediaMTX
  Get-Process -Name obs64,mediamtx -ErrorAction SilentlyContinue | ForEach-Object { "  kill $($_.Name) PID=$($_.Id)"; $_ | Stop-Process -Force -Confirm:$false; $killed += $_.Name }
  # 6) Chrome channel windows we launched. KEYED ON THE PROFILE (--user-data-dir), not the title.
  #
  # BUG FIXED 2026-08-02: this loop iterated 'colony','glass' ONLY and matched by MainWindowTitle
  # equality, so THE OVERLOOK WINDOW SURVIVED EVERY -Stop -- the operator's most important view,
  # orphaned on every teardown and then fighting the next bring-up. Title matching is doubly wrong:
  # a channel's title only resolves ~13s after launch (so a window mid-load matches nothing), and a
  # page that changes its own <title> escapes the reap entirely.
  #
  # The profile tag is assigned by studio_channels.ps1 and can never drift, which makes this both
  # complete and safe: it CANNOT match the operator's own Chrome, the command-center window
  # (chrome-profiles\command) or the Door window, because none of them carry a ch_* profile.
  try {
    foreach($tag in 'ch_colony','ch_glass','ch_overlook'){
      Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$tag*" -and $_.CommandLine -notlike '*--type=*' } |
        ForEach-Object { "  kill chrome [$tag] PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue; $killed += 'chrome' }
    }
  } catch {}
  # 7) the wrapper shells that launched Phoenix/Minecraft (killing the child above does not close
  #    the -NoExit powershell/cmd window that spawned it)
  Wrapper-Procs | Where-Object { $_.ProcessId -ne $PID } | ForEach-Object { "  kill wrapper-shell PID=$($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -Confirm:$false; $killed += 'wrapper' }
  return $killed
}

if($Stop){
  # WS1-M clean teardown. Refuse if OBS is streaming (would drop the audience mid-show).
  # H3: ask MediaMTX (the RTMP ingest), NOT the command center's air.streaming flag. The CC flag
  # reads false whenever its OBS websocket is momentarily disconnected even though OBS is still
  # pushing RTMP to the audience -- trusting it could tear down a genuinely-live show. MediaMTX's
  # /v3/paths/list shows the 'uni' path ready:true exactly when OBS is ingesting, independent of
  # the websocket. That is the authoritative "are we actually on air" signal.
  if(-not $Force){
    $live = $false
    try {
      $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:9997/v3/paths/list' -TimeoutSec 2
      $uni = $resp.items | Where-Object { $_.name -eq 'uni' }
      if($uni -and $uni.ready -eq $true){ $live = $true }
    } catch {}
    if($live){ 'REFUSING to -Stop while OBS is INGESTING to MediaMTX (uni path ready = you are LIVE). Run offair CONFIRM first, or add -Force.'; exit 2 }
  }
  "=== GRACEFUL PHASE: services close themselves; force is only the fallback ==="
  # systray FIRST or it resurrects the gracefully-closed node services mid-teardown
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*systray_watchdog.ps1*" -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false; "  systray watchdog stopped first (no resurrection during graceful close)" }
  foreach($g in @(@('command center',8098,'/api/shutdown'),@('overlay server',8099,'/shutdown'),@('publisher',8095,'/shutdown'))){
    try { Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:{0}{1}" -f $g[1],$g[2]) -Headers @{'x-uni-cc'='1'} -ContentType 'application/json' -Body '{}' -TimeoutSec 3 | Out-Null; "  graceful stop sent: $($g[0])" } catch { "  $($g[0]) not answering (already down)" }
  }
  # OBS: CloseMainWindow = a CLEAN exit that removes its own .sentinel, so the next start can never
  # show the safe-mode dialog. Force-kill is exactly what CREATED the sentinel/safe-mode problem.
  $obsProc = Get-Process obs64 -ErrorAction SilentlyContinue
  if($obsProc){
    # OBS runs --minimize-to-tray, so CloseMainWindow can no-op (no visible main window). Try it,
    # then taskkill WITHOUT /F (posts WM_CLOSE to all its windows incl. hidden -> OBS treats it as a
    # normal quit, writes clean shutdown, removes its own .sentinel). Force only as the last resort.
    $obsProc.CloseMainWindow() | Out-Null
    if(-not $obsProc.WaitForExit(4000)){
      taskkill /PID $obsProc.Id 2>$null | Out-Null
      if($obsProc.WaitForExit(8000)){ "  OBS closed gracefully via WM_CLOSE (clean exit, no sentinel -> no safe-mode dialog next start)" }
      else { "  OBS ignored WM_CLOSE in 8s - force fallback below" }
    } else { "  OBS closed gracefully (clean exit, no sentinel -> no safe-mode dialog next start)" }
  }
  Start-Sleep 1
  "=== BRINGING DOWN THE UNI BROADCAST STUDIO (full stack, verified) ==="
  Kill-Everything | Out-Null
  Start-Sleep 2
  # Second pass -- some processes (esp. erl.exe with a supervisor) take a beat to actually die,
  # or spawn a replacement. Sweep again before declaring victory.
  $second = Kill-Everything
  if($second.Count -gt 0){ "  (second pass caught: $($second -join ', '))" }
  Start-Sleep 2

  # ---- VERIFY: nothing this script owns is still running. Print PASS/FAIL, do not just claim it.
  ""
  "=== VERIFYING TEARDOWN ==="
  $ok = $true
  $portChecks = @(@('Minecraft',25565),@('Phoenix',4000),@('Colony cam',3020),@('OBS ws',4455),@('Overlay srv',8099),@('MediaMTX api',9997),@('Command center',8098),@('Air JSON',8097),@('Publisher regs',8095),@('Source gateway',8443))
  foreach($s in $portChecks){
    $up = Test-Port $s[1]
    "{0,-16} {1}" -f $s[0], $(if($up){'STILL UP <<<'}else{'down (ok)'})
    if($up){ $ok = $false }
  }
  $procChecks = @(
    @('OBS process', {[bool](Get-Process obs64 -ErrorAction SilentlyContinue)}),
    @('MediaMTX process', {[bool](Get-Process mediamtx -ErrorAction SilentlyContinue)}),
    @('Phoenix process(es)', {[bool](Phoenix-Procs)}),
    @('Minecraft process', {[bool](Minecraft-Procs)}),
    @('Wrapper shells', {[bool](Wrapper-Procs | Where-Object { $_.ProcessId -ne $PID })}),
    @('systray watchdog', {[bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*systray_watchdog.ps1*' -and $_.ProcessId -ne $PID })}),
    # orphan camera/body node Ports (phantom MC players if left behind)
    @('Camera/body nodes', {[bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*director.js*' -or $_.CommandLine -like '*body.js*' })})
  )
  foreach($c in $procChecks){
    $stillUp = & $c[1]
    "{0,-20} {1}" -f $c[0], $(if($stillUp){'STILL RUNNING <<<'}else{'down (ok)'})
    if($stillUp){ $ok = $false }
  }
  ""
  if($ok){ "=== DOWN: VERIFIED CLEAN (nothing left running) ===" }
  else { "=== DOWN: *** INCOMPLETE *** something above is still running -- re-run -Stop -Force, or reboot ==="; exit 3 }
  exit
}
if($Status){
  "=== UNI STUDIO STATUS ==="
  # Every port command_center.cjs and publisher.cjs listen on. WS1-G adds :8095 (publisher
  # registrations loopback) and :8097 (public air-status JSON) so -Status sees the whole surface.
  foreach($s in @(@('Minecraft',25565),@('Phoenix',4000),@('Colony cam',3020),@('OBS ws',4455),@('Overlay srv',8099),@('MediaMTX api',9997),@('Command center',8098),@('Air JSON',8097),@('Publisher regs',8095),@('Source gateway',8443))){
    "{0,-16} {1}" -f $s[0], $(if(Test-Port $s[1]){'UP'}else{'down'})
  }
  foreach($n in 'overlay_server.cjs','command_center.cjs','publisher.cjs','obs_supervisor.cjs','dual_push.cjs','health_ticker.cjs','music_director.cjs','voice_server.cjs'){ "{0,-20} {1}" -f $n, $(if(Node-Running $n){'running'}else{'DOWN'}) }
  # Zombie / duplicate detection: process alive but port down (or MORE THAN ONE process) is the
  # exact state that caused a silent duplicate Phoenix node before. Surface it loudly.
  $phx = @(Phoenix-Procs)
  if($phx.Count -gt 1){ "  *** WARNING: $($phx.Count) Phoenix (-sname uni) processes running simultaneously -- PIDs: $(($phx | ForEach-Object {$_.ProcessId}) -join ', ') -- run -Stop then bring up fresh ***" }
  elseif($phx.Count -eq 1 -and -not (Test-Port 4000)){ "  *** WARNING: Phoenix process (PID=$($phx[0].ProcessId)) alive but :4000 not responding -- ZOMBIE, run -Stop ***" }
  $mc = @(Minecraft-Procs)
  if($mc.Count -gt 1){ "  *** WARNING: $($mc.Count) Minecraft processes running simultaneously -- PIDs: $(($mc | ForEach-Object {$_.ProcessId}) -join ', ') ***" }
  elseif($mc.Count -eq 1 -and -not (Test-Port 25565)){ "  *** WARNING: Minecraft process (PID=$($mc[0].ProcessId)) alive but :25565 not responding -- ZOMBIE, run -Stop ***" }
  exit
}

# STORM BREAKER (2026-07-14, after the OBS/cc-window spawn storm): exactly ONE bring-up may run at
# a time, enforced by an OS named mutex. A buggy or malicious caller can invoke this script a
# thousand times; every extra instance exits here in <1s having started NOTHING. -Stop/-Status are
# above this line on purpose (never blocked). -MutexProbe is the side-effect-free Class-A drill:
# it acquires (or fails to acquire) the real mutex, prints which, holds 3s, and exits.
$script:upMtx = New-Object System.Threading.Mutex($false,'UNI_STUDIO_UP')
$got = $false
try { $got = $script:upMtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if($MutexProbe){
  if($got){ 'MUTEX: HELD (this instance would proceed)'; Start-Sleep 3 } else { 'MUTEX: BUSY (another bring-up in flight - would exit without starting anything)' }
  exit 0
}
if(-not $got){ 'another studio_up bring-up is already in flight (UNI_STUDIO_UP mutex busy) - exiting; shells can never stack'; exit 0 }

# ---- QUIET-MODE LATCH (added 2026-08-10) --------------------------------------------------------
# A quiet box must not be slammed back to life by a bare studio_up -- and the boot shim used to run
# exactly that unconditionally, which is how a reboot re-slammed the machine even with quiet latched.
# RESUME (viewer\quiet_mode.cjs) CLEARS the latch BEFORE it calls this script, so the operator's way
# back on is unaffected: only an un-cleared quiet state is refused here. -Force overrides for the
# rare case the operator deliberately wants a full bring-up without first leaving quiet.
# -Stop / -Status / -MutexProbe are all ABOVE this line on purpose, so they always work in quiet.
$quietLatch = Join-Path $PSScriptRoot 'runtime\quiet_mode.json'
$isQuietLatched = $false
try { if(Test-Path $quietLatch){ $isQuietLatched = [bool]((Get-Content -LiteralPath $quietLatch -Raw | ConvertFrom-Json).quiet) } } catch { $isQuietLatched = $false }
if($isQuietLatched -and -not $Force){
  "QUIET MODE latched (viewer\runtime\quiet_mode.json) -- REFUSING the full studio bring-up so a quiet box is not slammed."
  "  This is deliberate, not a fault. RESUME (Door button / tray / POST 127.0.0.1:8090/api/resume) clears the latch and brings the studio up."
  "  To bring up anyway WITHOUT leaving quiet, re-run with -Force."
  exit 0
}

"=== BRINGING UP THE UNI BROADCAST STUDIO ==="

# COLONY PLACEMENT (ADR-PROD-013, owner-set): THINKER does NOT host the colony. It runs on UNI-LAB
# (10.190.245.122), rootless, "on the chip" -- ALWAYS. This studio CAPTURES it over the LAN. By default
# (-HostColony absent) we do NOT launch a local Minecraft/Phoenix here; we just check the lab colony is
# reachable. -HostColony is a NON-CANONICAL legacy/dev escape hatch that runs a local colony on THINKER --
# do not use for production; it violates the single-colony-on-the-chip invariant.
if(-not $HostColony){
  "=== COLONY: NOT hosted on THINKER (ADR-PROD-013) -- the colony runs on UNI-LAB, rootless. This studio captures it over the LAN, BY NAME (self-net 2026-07-15: the chip LAN IP is a transient uplink; resolve uni-lab-lan.uni-lab.local, never a literal). ==="
  if(Test-NetConnection -ComputerName 'uni-lab-lan.uni-lab.local' -Port 4200 -WarningAction SilentlyContinue -InformationLevel Quiet){
    "  UNI-LAB producer :4200 reachable (the OVERLOOK source) -- good."
  } else {
    "  *** WARN: UNI-LAB producer :4200 (uni-lab-lan.uni-lab.local) NOT reachable. Confirm the colony/producer is up on UNI-LAB and its :4200 is published to the LAN. The studio will still start, but OVERLOOK has nothing to capture until the producer is up. ***"
  }
} else {
  "=== -HostColony (NON-CANONICAL): launching a LOCAL colony on THINKER -- the colony belongs on UNI-LAB per ADR-PROD-013; use only for legacy/dev ==="

# 1) Minecraft -- process-level zombie guard, not just the port.
$mcProcs = @(Minecraft-Procs)
if($mcProcs.Count -gt 0 -and -not (Test-Port 25565)){
  "ABORT: a Minecraft process is already running (PID $(($mcProcs | ForEach-Object {$_.ProcessId}) -join ', ')) but :25565 is not responding -- ZOMBIE. Run: studio_up.ps1 -Stop -Force  then retry."
  exit 1
}
if($mcProcs.Count -eq 0){
  if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
  Start-Process -WindowStyle Hidden -FilePath 'java.exe' -ArgumentList '-jar','paper.jar','nogui' -WorkingDirectory "$ROOT\mcserver" -RedirectStandardOutput "$ROOT\logs\minecraft.out.log" -RedirectStandardError "$ROOT\logs\minecraft.err.log" | Out-Null
  "started Minecraft (hidden; logs -> $ROOT\logs\minecraft.out.log)"
}
else { "  reuse Minecraft (PID=$($mcProcs[0].ProcessId))" }
if(-not (Wait-Port 25565 'Minecraft' 300)){ 'ABORT: Minecraft did not start'; exit 1 }

# 2) Phoenix node (ONE node only) + /stream to start the Producer -- process-level zombie/duplicate
#    guard. This is the exact bug that bit us: Test-Port alone let a second -sname uni node start
#    next to a hung one. Refuse outright rather than silently duplicating.
$phxProcs = @(Phoenix-Procs)
if($phxProcs.Count -gt 1){
  "ABORT: $($phxProcs.Count) Phoenix (-sname uni) processes already running (PIDs $(($phxProcs | ForEach-Object {$_.ProcessId}) -join ', ')) -- refusing to add a third. Run: studio_up.ps1 -Stop -Force  then retry."
  exit 1
}
if($phxProcs.Count -eq 1 -and -not (Test-Port 4000)){
  "ABORT: a Phoenix process is already running (PID=$($phxProcs[0].ProcessId)) but :4000 is not responding -- ZOMBIE. Run: studio_up.ps1 -Stop -Force  then retry."
  exit 1
}
# UNI_AUTOSTART=1 makes SP.Show start the SUPERVISED show (Colony + Director + Producer,
# restart-safe) with the node, plus a supervised colony populator -- so "the REAL Producer is
# running the show" is guaranteed, not assumed (the fix for the recurring puppet-cam incident).
if($phxProcs.Count -eq 0){
  if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
  # ORPHAN PRE-CLEAN (2026-07-12 audit fix). Count==0 means NO -sname uni supervisor is alive, so any
  # body.js / director.js / throttle still running are TRUE orphans from a prior unclean exit. If we
  # start a fresh Phoenix now, UNI_AUTOSTART spawns a SECOND colony ON TOP of the survivors ->
  # duplicate phantom MC players (the recurring bug). Reap the parentless children first. This is
  # SAFE precisely because no supervisor exists here -- it can never touch a live colony (a live
  # colony would have Count>=1 and take the reuse branch below instead).
  $orphans = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*viewer/body.js*' -or $_.CommandLine -like '*viewer\body.js*' -or $_.CommandLine -like '*director.js*' -or $_.CommandLine -like '*throttle_colony.cjs*' })
  if($orphans.Count -gt 0){
    "  PRE-CLEAN: reaping $($orphans.Count) parentless colony node(s) (body.js/director.js/throttle) before fresh Phoenix -- prevents duplicate phantom players"
    $orphans | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
    Start-Sleep 1
  }
  # UNI_AUTOSTART=1 -> SP.Show supervised bring-up (Colony + Director + Producer + colony populator).
  # BOOT-PERSISTENCE FIX (2026-07-12): launch with elixir.bat (HEADLESS), NOT iex.bat. iex.bat is
  # `elixir.bat +iex` -- the +iex flag starts an INTERACTIVE shell that reads stdin. When the launcher
  # is non-interactive (a boot/Startup shortcut, a transient agent shell, a hidden Start-Process with a
  # closed stdin), that stdin hits EOF and iex TERMINATES the BEAM the moment the launcher exits --
  # taking Phoenix down and ORPHANING the per-UNI body.js bots (observed 2026-07-12: 5 orphaned bodies
  # + 1 orphaned director after a hidden launch). elixir.bat --no-halt runs the SAME phx.server with the
  # SAME --sname uni --cookie sp + UNI_AUTOSTART, but reads NO stdin, so it survives a headless launch
  # exactly like java/node/mediamtx do. (No .iex.exs exists, so the REPL was doing nothing at boot.)
  # The process is still erl.exe -sname uni, so Phoenix-Procs (zombie guard + -Stop) still match it.
  $env:UNI_AUTOSTART = '1'
  Start-Process -WindowStyle Hidden -FilePath 'elixir.bat' -ArgumentList '--no-halt','--sname','uni','--cookie','sp','-S','mix','phx.server' -WorkingDirectory "$ROOT\ui" -RedirectStandardOutput "$ROOT\logs\phoenix.out.log" -RedirectStandardError "$ROOT\logs\phoenix.err.log" | Out-Null
  "started Phoenix (headless elixir --no-halt; UNI_AUTOSTART=1; boot-persistent; logs -> $ROOT\logs\phoenix.out.log)"
}
else { "  reuse Phoenix (PID=$($phxProcs[0].ProcessId))" }
if(-not (Wait-Port 4000 'Phoenix' 420)){ 'ABORT: Phoenix did not start'; exit 1 }
try { Invoke-WebRequest -UseBasicParsing http://localhost:4000/stream -TimeoutSec 10 | Out-Null; "  kicked /stream (Producer)" } catch {}
if(-not (Wait-Port 3020 'Colony cam' 240)){ 'WARN: colony cam (:3020) not up - camera may be starting' }

# 2b) PUPPET-CAM GUARD: confirm the REAL Producer is running the show, not a headless orbit.
#     verdict=LIVE ALONE is VACUOUS: /producer/health sets it on PID-existence, so a :self puppet
#     still reports LIVE (see health_controller.ex). We therefore require driver=producer AND the
#     frame counter to ADVANCE across two probes. (A deeper fix - reading the Director's real driver
#     field - is the colony/Elixir lane; tracked in docs/SYSTEM_OVERVIEW.md gaps.)
Start-Sleep 6
try {
  $p1 = Invoke-RestMethod -Uri 'http://localhost:4000/producer/health' -TimeoutSec 5
  Start-Sleep 4
  $p2 = Invoke-RestMethod -Uri 'http://localhost:4000/producer/health' -TimeoutSec 5
  $advanced = ($p2.frame -gt $p1.frame)
  if($p2.verdict -eq 'LIVE' -and $p2.driver -eq 'producer' -and $advanced){
    "  OK Producer LIVE (frame $($p1.frame)->$($p2.frame) advancing, colony=$($p2.colony_count), driver=producer)"
  } else {
    "  *** WARN puppet-cam risk: verdict=$($p2.verdict) driver=$($p2.driver) frame $($p1.frame)->$($p2.frame) advanced=$advanced. Require LIVE + driver=producer + frame-advance (verdict=LIVE alone is not enough). Open http://localhost:4000/stream. ***"
  }
} catch { "  WARN /producer/health not readable yet (show may still be booting): $($_.Exception.Message)" }
}  # end -HostColony (legacy local-colony) block; the studio below always runs on THINKER

# 3) OBS (profile UNI). P3.9 (2026-07-12): clear OBS 30+ .sentinel directory BEFORE start so the
#    "Safe Mode" dialog does not block the tray-only bring-up. OBS creates .sentinel at startup +
#    removes it at clean shutdown; a leftover sentinel = "did we crash?" prompt. If a stray dialog
#    still slips through, systray_watchdog's EnumWindows watcher SendKeys-dismisses it within 5s.
$obsData = Join-Path $env:APPDATA 'obs-studio'
$sentinelDir = Join-Path $obsData '.sentinel'
# ROOT CAUSE of the chronic "crash detected / safe mode / Failed to find locale" saga (2026-07-14,
# proven): the OBS INSTALL is pristine (75 locale files, all plugins present). Two SELF-INFLICTED
# things stacked: (1) OBS drops .sentinel\run_<uuid> on start and deletes it ONLY on a clean exit, so
# every force-kill (or a stacked duplicate OBS from a spawn loop) leaves an orphan -> next start
# declares a crash and offers safe mode, which skips obs-websocket -> :4455 never binds. Remove the
# WHOLE .sentinel dir every start so a hard-killed OBS ALWAYS comes back clean, no dialog. (2) The
# "Failed to find locale/en-US.ini" dialog was a launcher bug: obs launched via `cmd /c start` had the
# WRONG working dir. This script launches with -WorkingDirectory (Split-Path $OBS) = the bin dir, so
# obs resolves ..\..\data\obs-studio\locale correctly. NEVER launch obs any other way.
# BULLETPROOF SENTINEL CLEAR (hardened 2026-08-04, operator mandate: OBS comes up clean EVERY time,
# safe mode NEVER appears). .sentinel is a DIRECTORY holding run_<uuid> marker files (this OBS
# version's design; obs_supervisor.cjs documents it). A marker left by a crashed or hard-killed OBS
# is what makes the next start declare "unclean shutdown" and offer safe mode, which skips
# obs-websocket so :4455 never binds and the studio hangs - exactly the failure measured this day.
# (ASCII-only, deliberately: PowerShell 5.1 reads a BOM-less .ps1 as CP1252, and an em-dash decodes
#  to a smart quote that can silently close a string. Harmless inside a comment, fatal outside one -
#  studio_boot.ps1 was killed by exactly that on 2026-08-05. Keep every .ps1 here pure ASCII.)
# The OLD line here was `Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`, which can hit a
# NonInteractive confirmation prompt and SILENTLY FAIL, leaving the markers in place. .NET's
# Directory.Delete NEVER prompts, so it is deterministic. This is the boot-path twin of
# obs_supervisor.cjs's clearSentinel(); --disable-shutdown-check is the belt to these braces.
try {
  if([System.IO.Directory]::Exists($sentinelDir)){
    [System.IO.Directory]::Delete($sentinelDir, $true)   # whole dir incl. every run_<uuid> marker; OBS recreates it clean
    "  cleared OBS .sentinel (all crash/safe-mode markers) via .NET"
  } elseif([System.IO.File]::Exists($sentinelDir)){
    [System.IO.File]::Delete($sentinelDir); "  cleared OBS .sentinel file"
  }
} catch {
  # last-ditch: delete the marker files one by one, still without a prompt
  try { Get-ChildItem -LiteralPath $sentinelDir -Force -Recurse -File -ErrorAction Stop | ForEach-Object { [System.IO.File]::Delete($_.FullName) }; "  cleared OBS .sentinel markers individually" }
  catch { "  WARN: could not fully clear .sentinel: $($_.Exception.Message)" }
}
if(Test-Path $sentinelDir){
  $sn = @(Get-ChildItem -LiteralPath $sentinelDir -Force -Recurse -ErrorAction SilentlyContinue).Count
  if($sn -gt 0){ "  WARN: .sentinel still holds $sn marker(s) -- OBS may offer safe mode" }
}
foreach($marker in @('safe_mode','crashed','SafeMode','profiler-data.csv.lock')){
  $p = Join-Path $obsData $marker
  if(Test-Path $p){ Remove-Item -Path $p -Force -ErrorAction SilentlyContinue; "  cleared OBS marker: $marker" }
}
# Also blow away any *.lock files under obs-studio/profiles or scenes that survived a hard-kill.
Get-ChildItem -Path $obsData -Recurse -Filter '*.lock' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
# 2026-07-17 PRODUCTION HARDENING: install the LAN self-signed cert (uni-lab.local root) into
# CurrentUser\Root BEFORE OBS launches, so CEF picks it up on init. Idempotent; needs no elevation.
# Silent fix for the class where cap_web / cap_glass etc. render BLACK because CEF cannot click
# through a self-signed cert warning (caught LIVE 2026-07-17 during the go-live).
powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT\viewer\install_lan_cert.ps1" 2>&1 | Out-Null
"  LAN cert trust: refreshed CurrentUser\Root (idempotent)"
if(-not (Test-Port 4455)){
  Start-Process $OBS -WorkingDirectory (Split-Path $OBS) -ArgumentList '--profile','UNI','--collection','UNI','--disable-shutdown-check','--disable-missing-files-check','--minimize-to-tray' | Out-Null
  "started OBS (hidden to tray; markers cleared)"
}
if(-not (Wait-Port 4455 'OBS websocket' 90)){ 'WARN: OBS ws not up in 90s - systray_watchdog will attempt SendKeys on any residual safe-mode dialog' }

# 4) channels (colony+glass windows) + colony 30fps cap
powershell -ExecutionPolicy Bypass -File "$ROOT\viewer\studio_channels.ps1" | Out-Null
"  channels launched"; Start-Sleep 2
node "$ROOT\viewer\throttle_colony.cjs" | Out-Null

# 4a) THE CHANNEL WINDOW GUARD (wired in 2026-08-03). studio_channels.ps1 runs ONCE and never looks
# again; channels.json is a frozen snapshot that studio_stage.cjs binds cap_colony / cap_overlook
# from at build time. If a channel window dies afterwards, the OBS window_capture captures pure
# black and REPORTS NO ERROR ANYWHERE -- and nothing in this script noticed.
#
# The guard existed since 2026-08-03 but was never started here, so it only ran when someone typed
# it. Its own receipt says so: "The watchdog is not boot-persistent. It is a resident process
# started by hand tonight." It is now also in the per-user Startup folder
# (UNI-Channel-Windows-Watchdog.vbs) for the reboot case.
#
# The guard now asks three independent questions -- process existence, PAGE liveness over CDP
# (added 2026-08-03, after a crash page went to air), and WINDOW capturability (added 2026-08-04,
# after a MINIMIZED window fed OBS pure black for hours while every other check said healthy).
# See channel_windows_watchdog.ps1's header; do not assume any one of the three covers another.
#
# THE ALREADY-RUNNING CHECK USED TO BE BROKEN, and it is worth knowing why (measured 2026-08-04).
# It was `Get-Process ... | Where-Object { $_.CommandLine -like ... }`. Windows PowerShell 5.1's
# Get-Process has NO CommandLine property -- that was added in PowerShell 6. So $_.CommandLine was
# $null for every process, the filter matched nothing, the else branch always ran, and every single
# studio_up run started ANOTHER watchdog while printing "started" as though it were the first.
# Three were found running concurrently, each with its OWN in-memory rate-limit state, which
# silently divided that script's anti-storm backoff by three. Get-CimInstance Win32_Process does
# expose CommandLine and is what the watchdog itself uses to find the Chrome windows.
$guard = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
             Where-Object { $_.CommandLine -like '*channel_windows_watchdog*' })
if ($guard.Count -gt 0) {
  "  channel-window guard already running ($($guard.Count))"
} else {
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',"$ROOT\viewer\channel_windows_watchdog.ps1" | Out-Null
  "  channel-window guard started"
}

# 4c) CAMERA LINK WATCHER (added 2026-08-04, at the operator's instruction: "I need the camera link
# to always work from any LANs ... I cannot chase this configuration and you must pin it hard").
# camera_link.cjs decides the canonical publish URL by STABILITY rather than by whatever answered
# fastest, and --watch announces exactly two events: the URL changed, or it stopped working. Both
# are things that would otherwise be discovered by failing to start a camera in front of an
# audience. It probes four paths every 5 minutes and is silent in between, on purpose.
# NOTE the dedup idiom: Get-CimInstance, NOT Get-Process. Windows PowerShell 5.1's Get-Process has
# no CommandLine property, which is exactly how this script silently stacked duplicate watchdogs.
$camw = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*camera_link*--watch*' })
if ($camw.Count -gt 0) {
  "  camera-link watcher already running ($($camw.Count))"
} else {
  Start-Process -FilePath 'node.exe' -ArgumentList 'viewer/camera_link.cjs','--watch','300' -WorkingDirectory $ROOT -WindowStyle Hidden | Out-Null
  "  camera-link watcher started"
}

# 5) overlay server
Start-NodeWindow 'UNI OVERLAY SERVER' 'overlay_server.cjs'
Wait-Port 8099 'Overlay server' 20 | Out-Null

# 5a) THE FOUR LIVE-BROADCAST SUPERVISORS (added 2026-08-02, all four written and proven during a
# live show). Before this they ran as loose background processes and would NOT have survived a
# reboot -- the simulcast and the OBS crash-healer would have been silently absent next boot.
#   obs_supervisor --watch : heals OBS safe-mode / the zombie single-instance lock / a dead
#                            websocket. REFUSES to restart OBS while streaming (checks first).
#   dual_push              : the YouTube + Twitch simulcast pushers off the local relay, each
#                            auto-restarting. Started after MediaMTX below, since it reads the relay.
#   health_ticker          : folds the real /api/health onto the ON-AIR ticker -- the estate's
#                            "say what is broke, on air" rule made literal.
#   music_director         : ducks the bed under a hot mic and enforces ONE bed at a time.
Start-NodeHidden 'UNI OBS SUPERVISOR' 'obs_supervisor.cjs' '--watch'
Start-NodeHidden 'UNI HEALTH TICKER'  'health_ticker.cjs'
Start-NodeHidden 'UNI MUSIC DIRECTOR' 'music_director.cjs'
# The agent's VOICE, as a first-class broadcast source. It renders Piper to a file and plays it via
# the ovl_voice browser source INSIDE OBS -- no Windows audio device is captured at any point, which
# is what makes it survive a headset being unplugged or Windows changing its default output. It also
# owns the music duck, because it gets play-start/play-end from the player itself rather than
# inferring them from a level meter. Must be up BEFORE ovl_voice loads or the page has nothing to
# connect to and simply retries with backoff.
Start-NodeHidden 'UNI VOICE'          'voice_server.cjs'

# 6) mediamtx (remote-source + restreamer ingest)
if(-not (Test-Port 9997)){
  if(-not (Test-Path "$ROOT\logs")){ New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
  Start-Process -WindowStyle Hidden -FilePath $MTX -ArgumentList "$ROOT\viewer\mediamtx_local.yml" -RedirectStandardOutput "$ROOT\logs\mediamtx.out.log" -RedirectStandardError "$ROOT\logs\mediamtx.err.log" | Out-Null
  "started MediaMTX (hidden; logs -> $ROOT\logs\mediamtx.out.log)"
}
Wait-Port 9997 'MediaMTX' 20 | Out-Null

# 6a) the simulcast pushers -- AFTER MediaMTX, because they read the relay at rtmp://127.0.0.1:1935/uni.
# They wait and reconnect if the relay is not publishing yet, so ordering here is a courtesy, not a
# dependency. This is what carries YouTube AND Twitch off ONE encode.
Start-NodeHidden 'UNI SIMULCAST' 'dual_push.cjs'

# 7) build the stage on EVERY bring-up. studio_stage.cjs itself refuses to touch OBS while it is
#    actively streaming (the only state a rebuild could disrupt), so the old "skip when the command
#    center is already running" guard was redundant - and harmful: re-runs came up with an EMPTY
#    stage (overlay server up, but no ovl_* sources inside OBS = a program with NO overlays that
#    still looked handled). See docs/STUDIO_SYSTEMS.md "The overlay trap". FIXED 2026-07-11.
if(Test-Port 4455){ node "$ROOT\viewer\studio_stage.cjs" | Select-Object -Last 1 }
# 7b) OVERLAY PROOF GATE (binding, docs/STUDIO_SYSTEMS.md): overlays are only "up" if OBS itself
#     carries the enabled ovl_* browser-sources pointed at :8099 - proven, never inferred.
node "$ROOT\viewer\verify_overlays.cjs"
$script:overlaysProven = ($LASTEXITCODE -eq 0)
if(-not $script:overlaysProven){ "*** OVERLAY PROOF GATE FAILED - the program has NO verified overlays (dev-preview OBS is NOT broadcast-ready). ***" }

# 8) command center
Start-NodeHidden 'UNI COMMAND CENTER' 'command_center.cjs'
Wait-Port 8098 'Command center' 20 | Out-Null

# 8b) P3.7 (2026-07-12) - auto-open the command_center Chrome window (THE one visible surface).
#     Poll /api/state up to 15s in case node.js is still binding, then --app the browser.
$script:ccReady = $false
for($i=0;$i -lt 15;$i++){
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8098/api/state' -TimeoutSec 2 -ErrorAction Stop
    if($r.StatusCode -eq 200){ $script:ccReady = $true; break }
  } catch {}
  Start-Sleep 1
}
if($script:ccReady){
  # WINDOW DEDUP (2026-07-14): idempotent bring-up must be idempotent in WINDOWS too. During the
  # spawn storm every re-run popped ANOTHER command-center Chrome window; now a window is opened
  # only if none exists for our dedicated profile dir.
  $ccWin = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*chrome-profiles\command*' })
  if($ccWin.Count -gt 0){
    "  command_center window already open (chrome PID $($ccWin[0].ProcessId)) - not opening another (window dedup)"
  } else {
  if(-not (Test-Path "$ROOT\chrome-profiles\command")){ New-Item -ItemType Directory -Path "$ROOT\chrome-profiles\command" -Force | Out-Null }
  $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  if(-not (Test-Path $chrome)){ $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
  if(Test-Path $chrome){
    Start-Process -FilePath $chrome -ArgumentList '--app=http://127.0.0.1:8098/','--window-size=1600,1000','--window-position=160,80',"--user-data-dir=$ROOT\chrome-profiles\command" | Out-Null
    "  opened command_center Chrome (1600x1000 @ 160,80) - the ONE visible operator surface"
  } else {
    "  chrome.exe not found; open http://127.0.0.1:8098/ manually"
  }
  }
} else {
  "  command_center /api/state did not answer in 15s; not auto-opening Chrome"
}

# 9) remote-source gateway - regenerate the self-signed cert if missing/expired first
powershell -ExecutionPolicy Bypass -File "$ROOT\viewer\gen_auto_cert.ps1" | ForEach-Object { "  $_" }
Start-NodeHidden 'UNI SOURCE GATEWAY' 'publisher.cjs'
Wait-Port 8443 'Source gateway' 20 | Out-Null

# 10) systray watchdog (WS1-K): traffic-light tray icon + auto-restart of any dead node service.
# Reuse if it's already running (self-check by script name in the command line).
if (-not [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*systray_watchdog.ps1*" -and $_.ProcessId -ne $PID })) {
  Start-Process powershell -WorkingDirectory $ROOT -ArgumentList '-NoProfile','-WindowStyle','Hidden','-File',"$ROOT\viewer\systray_watchdog.ps1"
  "  started systray_watchdog.ps1"
} else { "  reuse systray_watchdog.ps1" }

""
if($script:overlaysProven){ "=== STUDIO UP (overlays PROVEN) - THINKER is the render + operator studio ===" }
else { "=== STUDIO UP - WARNING: overlays UNVERIFIED - do NOT go live until verify_overlays.cjs exits 0 ===" }
"  Command center : auto-opened as its own Chrome window (or http://127.0.0.1:8098/)"
"  Camera gateway : https://10.190.245.196:8443/   (open on any LAN device)"
"  Smooth monitor : the OBS program projector (button in the command center)"
"  Systray icon   : bottom-right notification area (right-click for restart menu; Show Logs)"
"  Logs           : $ROOT\logs\ - overlay_server, command_center, publisher, phoenix, minecraft, mediamtx"
"  To fully stop  : powershell -File viewer\studio_up.ps1 -Stop"
""

if($Watch){
  "watchdog: restarting overlay_server / command_center / publisher / obs_supervisor / dual_push / health_ticker / music_director if they die (Ctrl-C to stop)"
  while($true){
    Start-Sleep 5
    # the four broadcast supervisors are watched too -- a dead supervisor is a silent single point of
    # failure: the simulcast or the OBS healer would be gone and nothing would say so.
    foreach($n in 'overlay_server.cjs','command_center.cjs','publisher.cjs','obs_supervisor.cjs','dual_push.cjs','health_ticker.cjs','music_director.cjs','voice_server.cjs'){
      if(-not (Node-Running $n)){
        $t = switch($n){ 'overlay_server.cjs'{'UNI OVERLAY SERVER'} 'command_center.cjs'{'UNI COMMAND CENTER'} 'publisher.cjs'{'UNI SOURCE GATEWAY'} 'obs_supervisor.cjs'{'UNI OBS SUPERVISOR'} 'dual_push.cjs'{'UNI SIMULCAST'} 'health_ticker.cjs'{'UNI HEALTH TICKER'} 'music_director.cjs'{'UNI MUSIC DIRECTOR'} 'voice_server.cjs'{'UNI VOICE'} }
        if($n -eq 'obs_supervisor.cjs'){ Start-NodeHidden $t $n '--watch'; "$(Get-Date -Format HH:mm:ss) $n DOWN - restarted"; continue }
        "$(Get-Date -Format HH:mm:ss) $n DOWN - restarting"
        Start-NodeWindow $t $n
      }
    }
  }
}
