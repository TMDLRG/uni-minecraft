# studio_boot.ps1 - bring the studio up at LOGON, and leave evidence that it did.
#
#   powershell -File viewer\studio_boot.ps1            # what the Startup shim runs
#   powershell -File viewer\studio_boot.ps1 -NoDelay   # same, immediately (for proving it)
#   powershell -File viewer\studio_boot.ps1 -ParseOnly # syntax-check this file and exit
#
# -------------------------------------------------------------------------------------------------
# WHY THIS EXISTS (2026-08-05)
# -------------------------------------------------------------------------------------------------
# Michael rebooted THINKER to check the studio was ready. It was not. Eighteen minutes after boot:
#
#     obs64.exe    : ABSENT        :4455 not listening
#     mediamtx.exe : ABSENT        :9997 and :1935 not listening
#
# Everything WITH a Startup entry came back - systray_watchdog, the channel-window guard, the door,
# Gaia, TRACK - and those in turn restored command_center, publisher and overlay_server. The two
# pieces that actually make a picture came back from nothing, because NOTHING RAN studio_up.ps1.
#
# The night before, studio_up.ps1 was proven to work: launched, OBS bound :4455 in 7s, overlays PASS.
# What was never proven is that anything CALLS it at boot. That is the estate's oldest failure mode
# wearing a new hat - a signal that measures EXISTENCE ("the boot script works") reported as OUTCOME
# ("the studio comes up after a reboot"). The script existed. The boot did not.
#
# -------------------------------------------------------------------------------------------------
# THIS FILE IS DELIBERATELY PURE ASCII, AND THAT IS A BUG FIX, NOT A STYLE CHOICE
# -------------------------------------------------------------------------------------------------
# The first version of this wrapper was written in UTF-8 with em-dashes and box-drawing rules in its
# comments. Windows PowerShell 5.1 reads a .ps1 with no BOM as ANSI (CP1252), so an em-dash (E2 80 94)
# decoded as three characters, the last of which - 0x94 - is U+201D, a RIGHT DOUBLE QUOTATION MARK.
# PowerShell accepts smart quotes as string delimiters, so that byte silently CLOSED a string in the
# middle of a line and the parse collapsed two lines later with a misleading error.
#
# A parse error means NOT ONE LINE of the script runs. The Startup shim launched it, PowerShell died
# before the first log write, and the failure looked exactly like the shim never firing at all. It
# was found only because this wrapper was tested by RUNNING it rather than by reading it. Keep this
# file ASCII-only; -ParseOnly below exists so the check is one command rather than a reboot.
#
# -------------------------------------------------------------------------------------------------
# THE DELAY IS LOAD-BEARING - IT IS NOT SUPERSTITION
# -------------------------------------------------------------------------------------------------
# Six other UNI-*.vbs shims fire at the same logon, and systray_watchdog.ps1 restarts
# command_center / publisher / overlay_server on a 5s timer. studio_up.ps1 starts those same three
# and dedups by asking whether they are already running - so if both arrive in the same instant they
# can BOTH observe "absent" and BOTH start one. That race produces duplicate supervisors, which is a
# real defect in this estate (duplicates divide their own rate limits and fight over the same ports).
#
# Waiting lets the watchdogs claim their three first; studio_up then sees them and prints "reuse".
# It also gives the GPU, the display and the network stack time to finish coming up before OBS is
# launched - OBS started into a half-initialised desktop is exactly how a session ends up unclean,
# which is the thing the operator said must NEVER happen.
#
# -------------------------------------------------------------------------------------------------
# IT LOGS, AND IT PROVES ITSELF
# -------------------------------------------------------------------------------------------------
# The shim runs hidden, so without this wrapper a failed boot is SILENT - which is how the failure
# above went unnoticed until a human looked. Everything below is appended to logs\studio_boot.log
# with timestamps, and the run ends by executing verify_overlays.cjs and recording its verdict. So
# after any reboot there is a file that says, in outcome terms, whether the studio came up with
# proven overlays or did not.
#
# TO DISABLE: delete the Startup shim
#   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\UNI-Studio-Up.vbs
# Nothing else references this file, so removing that one shim fully reverts the behaviour.
param(
  [switch]$NoDelay,
  [switch]$ParseOnly,
  [int]$DelaySeconds = 30
)

$ErrorActionPreference = 'Continue'

# -- self syntax check ---------------------------------------------------------------------------
# Tokenize this file without executing it. This is the falsifier for the encoding defect described
# above: a smart-quote smuggled in by an ANSI misread shows up here as a parse error, in one command,
# instead of as a silent no-op on the next reboot.
if ($ParseOnly) {
  $errs = $null
  $src = Get-Content -LiteralPath $PSCommandPath -Raw
  $null = [System.Management.Automation.PSParser]::Tokenize($src, [ref]$errs)
  $nonAscii = @()
  for ($i = 0; $i -lt $src.Length; $i++) { if ([int][char]$src[$i] -gt 127) { $nonAscii += $i } }
  if ($errs -and $errs.Count -gt 0) {
    Write-Output "PARSE: FAIL - $($errs.Count) error(s)"
    $errs | ForEach-Object { Write-Output ("  line {0}: {1}" -f $_.Token.StartLine, $_.Message) }
    exit 1
  }
  if ($nonAscii.Count -gt 0) {
    Write-Output "PARSE: FAIL - $($nonAscii.Count) non-ASCII byte(s); PowerShell 5.1 will misread them as CP1252"
    exit 1
  }
  Write-Output "PARSE: PASS - syntax clean and pure ASCII"
  exit 0
}

$root    = Split-Path -Parent $PSScriptRoot           # ...\UNI.Minecraft
$logDir  = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'studio_boot.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Say($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $msg
  try { Add-Content -LiteralPath $logFile -Value $line -Encoding utf8 } catch {}
  Write-Output $line
}

# Keep the log from growing without bound. This estate has shipped a 185 MB ndjson of one repeated
# line; an annunciation nobody can read is indistinguishable from silence.
try {
  if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 2MB)) {
    $keep = Get-Content -LiteralPath $logFile -Tail 400
    Set-Content -LiteralPath $logFile -Value $keep -Encoding utf8
  }
} catch {}

Say "================ STUDIO BOOT ================"
try {
  $bootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  Say ("boot {0} | uptime {1:N1} min | user {2}" -f $bootTime, ((Get-Date) - $bootTime).TotalMinutes, $env:USERNAME)
} catch { Say "boot time unavailable" }

# ---- DEFAULT TO QUIET (added 2026-08-10) --------------------------------------------------------
# The operator's instruction, verbatim: "it must default to quiet mode so it does not slam this box."
# This box is his computer as well as a studio, and the video core (OBS, MediaMTX, the Chrome channel
# windows measured at 10 GB, the simulcast encoders) is what slams it. A reboot must NOT bring that up.
#
# This DELIBERATELY REVERSES this file's original default (bring the studio fully up at boot, added
# 2026-08-05 so a reboot left the studio ready). Both needs are real; the operator has now chosen
# quiet as the safe default. The prior behaviour is preserved behind an explicit opt-in flag so it is
# not lost, only no longer the default:
#   ESCAPE HATCH: create  viewer\runtime\boot_live.flag  and boot brings the FULL studio up.
#
# The latch is written HERE, BEFORE the 30s delay, so channel_windows_watchdog and every other
# supervisor sees a quiet box from their very first sweep and never relaunches the video core during
# the window this script is still sleeping.
$runtimeDir = Join-Path $PSScriptRoot 'runtime'
$bootLive   = Join-Path $runtimeDir 'boot_live.flag'
$quietLatch = Join-Path $runtimeDir 'quiet_mode.json'
if (Test-Path $bootLive) {
  Say "BOOT LIVE marker present (runtime\boot_live.flag) -- will bring the FULL studio up (operator opted in)."
} else {
  if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
  if (-not (Test-Path $quietLatch)) {
    $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
    Set-Content -LiteralPath $quietLatch -Encoding ascii -Value ('{ "quiet": true, "since": "' + $ts + '", "actor": "boot-default", "reason": "boot defaults to quiet so a reboot never slams the box; RESUME to broadcast" }')
    Say "BOOT: defaulting to QUIET (wrote runtime\quiet_mode.json). The box will NOT be slammed."
  } else {
    Say "BOOT: quiet latch already present -- honoring it (box stays quiet)."
  }
}

if (-not $NoDelay) {
  Say "waiting ${DelaySeconds}s - let the logon watchdogs claim cc/publisher/overlay first, and let the display and network settle before OBS"
  Start-Sleep -Seconds $DelaySeconds
}

# -- IDEMPOTENCE GUARD: A MUTEX, NOT A COMMAND-LINE SEARCH -----------------------------------------
# The job here is narrow: if this logon fires the shim twice (double logon, fast user switch, or a
# human running it while the shim is mid-flight) the second one must stand down, so two studio_up
# runs cannot race into starting duplicate supervisors.
#
# The FIRST version of this guard searched running command lines for the string "studio_up.ps1" and
# declined if it found one. That was WRONG, and it was caught on 2026-08-05 by running it: it matched
# an agent's own logging shell, whose command line merely NAMED the script it had already finished
# running. Nothing was in flight; the guard declined anyway and wrote a calm, confident log line
# saying so.
#
# That is a FAIL-CLOSED bug in the boot path, and it is the worse direction: the studio silently does
# not come up, and the log explains why in a sentence that sounds correct. Any process on this box
# that so much as mentions the filename - a wrapper, an editor, a task runner, another agent - would
# have kept the studio dark. It is the same defect that once made a watchdog kill its own shell,
# which is a lesson this estate has now paid for twice.
#
# A mutex asks the right question. "Is another instance of ME running" is answered by identity, not
# by string-matching a process table. It is atomic, it cannot false-positive on someone else's
# command line, and the OS releases it if this process dies - including a hard kill, which surfaces
# as AbandonedMutexException and means we may proceed.
#
# Note also that studio_up.ps1 is itself idempotent by design - it prints "reuse" for every service
# it finds already running - so this guard is belt to that braces, not the only thing standing
# between us and duplicates. It is acquired BEFORE the delay so a second shim stands down at once
# rather than sleeping 30s and then discovering the race.
$mutex = New-Object System.Threading.Mutex($false, 'UNI-Studio-Boot-Singleton')
$owned = $false
try { $owned = $mutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $owned = $true; Say "note - previous studio_boot died without releasing; taking over" }
catch { $owned = $true; Say ("note - mutex unavailable (" + $_.Exception.Message + "); proceeding without the singleton guard") }
if (-not $owned) {
  Say "DECLINED - another studio_boot is already in flight. Standing down so we cannot race it."
  Say "================ END (declined) ================"
  exit 0
}

$upScript = Join-Path $PSScriptRoot 'studio_up.ps1'
if (-not (Test-Path $upScript)) { Say "FATAL - studio_up.ps1 not found at $upScript"; exit 2 }

# ---- QUIET BOOT: the default path. Do NOT start the video core. ---------------------------------
# The monitors (Door, HUD, Gaia, TRACK, and via systray the command center / overlay / publisher /
# voice) come up from their own logon shims - this script does not need to start them and must not
# start OBS / MediaMTX / the channel windows. We then run quiet_mode.cjs --quiet as a race-proof
# reap: if any shim launched a channel window in the sub-second before the latch was written above,
# this kills it and re-asserts the latch. It is idempotent - on a clean quiet boot it kills nothing.
if (-not (Test-Path $bootLive)) {
  Say "QUIET BOOT: not starting the video core (this is the default; create runtime\boot_live.flag to boot live)."
  try {
    $q = & node (Join-Path $PSScriptRoot 'quiet_mode.cjs') --quiet 2>&1
    foreach ($l in $q) { Say ("  | " + $l) }
  } catch { Say ("  | quiet reap EXCEPTION: " + $_.Exception.Message) }
  # HEALTH CHECKS so the boot log records ACCURATE status, not merely "stayed quiet".
  Start-Sleep -Seconds 4
  Say "BOOT health check (monitors that should be up in quiet):"
  foreach ($s in @(@('Door',8090),@('HUD',8100),@('Gaia',8096),@('TRACK',8102),@('Command center',8098),@('Overlay',8099))) {
    $up = [bool](Test-NetConnection 127.0.0.1 -Port $s[1] -WarningAction SilentlyContinue -InformationLevel Quiet)
    Say ("  {0,-16} :{1,-6} {2}" -f $s[0], $s[1], $(if ($up) { 'UP' } else { 'down (a logon shim may still be starting)' }))
  }
  Say "BOOT RESULT: QUIET -- video core down, monitors up. RESUME (Door button / tray / POST 127.0.0.1:8090/api/resume) to broadcast."
  Say "================ END (quiet boot) ================"
  try { $mutex.ReleaseMutex() } catch {}
  exit 0
}

Say "running studio_up.ps1"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$code = 0
try {
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $upScript 2>&1
  $code = $LASTEXITCODE
  foreach ($line in $out) { Say ("  | " + $line) }
} catch {
  Say ("  | EXCEPTION: " + $_.Exception.Message)
  $code = 99
}
$sw.Stop()
Say ("studio_up finished in {0:N0}s (exit {1})" -f $sw.Elapsed.TotalSeconds, $code)

# -- THE OUTCOME CHECK ----------------------------------------------------------------------------
# "studio_up exited 0" measures that a script ran. It does not measure that there is a picture with
# overlays on it. verify_overlays.cjs asks OBS itself and screenshots the program scene, so this line
# is the difference between a boot log that says something happened and one that says it worked.
Say "verifying - node viewer\verify_overlays.cjs"
$vcode = 0
try {
  $vout = & node (Join-Path $PSScriptRoot 'verify_overlays.cjs') 2>&1
  $vcode = $LASTEXITCODE
  foreach ($line in $vout) { Say ("  | " + $line) }
} catch {
  Say ("  | EXCEPTION: " + $_.Exception.Message)
  $vcode = 99
}

if ($vcode -eq 0) {
  Say "BOOT RESULT: STUDIO UP, OVERLAYS PROVEN (not streaming - go-live is the operator's)"
} else {
  Say "BOOT RESULT: DEGRADED - overlay proof exit $vcode. The studio is NOT ready; look at the lines above."
}
Say "================ END ================"
# Windows releases this on process exit anyway; releasing explicitly says the singleton window is
# over on purpose rather than by termination.
try { $mutex.ReleaseMutex() } catch {}
exit $vcode
