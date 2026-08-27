# hud_boot_healthcheck.ps1 - THE FULL POST-REBOOT HEALTH CHECK, owned by the HUD.
# ASCII ONLY (PS 5.1 reads a BOM-less .ps1 as CP1252; one smart quote silently closes a string and
# the whole file fails to parse - studio_boot.ps1 was killed by exactly that on 2026-08-05).
#
#   powershell -File viewer\hud\native\hud_boot_healthcheck.ps1            # what the Startup shim runs
#   powershell -File viewer\hud\native\hud_boot_healthcheck.ps1 -Now       # run immediately, no settle wait
#   powershell -File viewer\hud\native\hud_boot_healthcheck.ps1 -ParseOnly # syntax + ASCII check, no run
#
# -------------------------------------------------------------------------------------------------
# WHY THIS EXISTS (2026-08-17, operator instruction)
# -------------------------------------------------------------------------------------------------
# "HUD MUST always stay running and HUD MUST run full health check after a real reboot and stay in
# quiet mode until changed."
#
# Before this file, three separate things were true and none of them was checked at boot:
#   * The HUD's own 5-clause reboot-survival proof (hud_native_boot_proof.ps1) existed but NOTHING
#     RAN IT. It could only ever pass if a human typed it. That is this estate's oldest failure
#     shape - a proof that EXISTS versus a proof that RUNS - and it is the same reason
#     studio_boot.ps1 had to be written: studio_up.ps1 worked, but nothing called it at boot.
#   * Nothing verified after a restart that the box actually CAME BACK QUIET rather than being
#     slammed. The operator discovered that by watching his machine crawl, which is the worst
#     possible instrument.
#   * Nothing recorded an accurate, readable post-reboot STATUS anywhere the operator could look.
#
# So this script runs at logon, waits for the stack to settle, then asks - and WRITES DOWN - three
# questions in outcome terms:
#   1. Did the HUD survive the reboot?    (the native 5-clause proof, executed, not assumed)
#   2. Are the monitors actually up?      (ports probed, plus the HUD's own health endpoint)
#   3. Did the box stay QUIET?            (latch present AND the video core genuinely absent)
#
# It writes BOTH a human log and a machine-readable JSON so the Door and the command center can show
# the post-boot verdict without re-deriving it.
#
# IT NEVER STARTS THE VIDEO CORE. It is a health check, not a bring-up. If it finds the box was
# slammed it says so loudly and RE-ASSERTS QUIET (the operator's standing instruction is that the box
# stays quiet until HE changes it) - it does not shrug and leave 10 GB of Chrome running.
param(
  [switch]$Now,
  [switch]$ParseOnly,
  [int]$SettleSeconds = 45
)
$ErrorActionPreference = 'Continue'

if ($ParseOnly) {
  $errs = $null
  $src = Get-Content -LiteralPath $PSCommandPath -Raw
  $null = [System.Management.Automation.PSParser]::Tokenize($src, [ref]$errs)
  $nonAscii = @(); for ($i = 0; $i -lt $src.Length; $i++) { if ([int][char]$src[$i] -gt 127) { $nonAscii += $i } }
  if ($errs -and $errs.Count -gt 0) { "PARSE: FAIL - $($errs.Count) error(s)"; $errs | ForEach-Object { "  line $($_.Token.StartLine): $($_.Message)" }; exit 1 }
  if ($nonAscii.Count -gt 0) { "PARSE: FAIL - $($nonAscii.Count) non-ASCII byte(s)"; exit 1 }
  "PARSE: PASS - syntax clean and pure ASCII"; exit 0
}

$ROOT    = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$logDir  = Join-Path $ROOT 'logs'
$logFile = Join-Path $logDir 'hud_boot_healthcheck.log'
$outJson = Join-Path $ROOT 'viewer\runtime\hud_boot_health.json'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Say($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $msg
  try { Add-Content -LiteralPath $logFile -Value $line -Encoding ascii } catch {}
  Write-Output $line
}
# Bounded log: this estate has shipped a 185 MB ndjson of one repeated line, and an annunciation
# nobody can read is indistinguishable from silence.
try { if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 1MB)) { $keep = Get-Content $logFile -Tail 300; Set-Content -LiteralPath $logFile -Value $keep -Encoding ascii } } catch {}

# Singleton: a double logon must not run two of these at once.
$mutex = New-Object System.Threading.Mutex($false, 'UNI-HUD-BootHealthCheck')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true } catch { $owned = $true }
if (-not $owned) { Say "DECLINED - another boot health check is in flight"; exit 0 }

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$uptimeMin = ((Get-Date) - $boot).TotalMinutes
Say "================ HUD BOOT HEALTH CHECK ================"
Say ("boot {0} | uptime {1:N1} min | user {2}" -f $boot, $uptimeMin, $env:USERNAME)

if (-not $Now) {
  Say "settling ${SettleSeconds}s - let the HUD service, the logon shims and the watchdogs finish coming up"
  Start-Sleep -Seconds $SettleSeconds
}

# ---- 1. THE HUD ITSELF: run its own 5-clause native reboot-survival proof --------------------------
Say "--- 1. HUD reboot-survival (running hud_native_boot_proof.ps1, not assuming it) ---"
$proofScript = Join-Path $PSScriptRoot 'hud_native_boot_proof.ps1'
$hudProven = $false
$proofLines = @()
if (Test-Path $proofScript) {
  try {
    $proofLines = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $proofScript 2>&1
    $hudProven = ($LASTEXITCODE -eq 0)
    foreach ($l in $proofLines) { Say ("  | " + $l) }
  } catch { Say ("  | EXCEPTION: " + $_.Exception.Message) }
} else { Say "  | MISSING: $proofScript" }
Say ("  HUD reboot-survival: " + $(if ($hudProven) { 'PROVEN' } else { 'NOT PROVEN' }))

# ---- 2. THE HUD IS ACTUALLY SERVING (process alive is not the same as working) ---------------------
Say "--- 2. HUD is serving ---"
$hudPort = [bool](Test-NetConnection 127.0.0.1 -Port 8100 -InformationLevel Quiet -WarningAction SilentlyContinue)
$hudOk = $false; $hudInstrument = $null
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8100/api/hud/health' -TimeoutSec 5
  $hudInstrument = $h.envelope.instrument
  $hudOk = [bool]$h.result.ok
} catch { Say ("  health read failed: " + $_.Exception.Message) }
Say ("  :8100 up={0}  health.ok={1}  instrument={2}" -f $hudPort, $hudOk, $hudInstrument)
$svcHud = Get-Service -Name 'UNI-HUD' -ErrorAction SilentlyContinue
$svcLnch = Get-Service -Name 'UNI-HUD-WidgetLauncher' -ErrorAction SilentlyContinue
$widget = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'UNI.Hud.Widget' })
Say ("  service UNI-HUD={0}  WidgetLauncher={1}  widget_process={2}" -f $svcHud.Status, $svcLnch.Status, $widget.Count)

# ---- 3. THE MONITORS -------------------------------------------------------------------------------
Say "--- 3. monitors that must be up in quiet ---"
$monitors = @(@('Door',8090),@('HUD',8100),@('Gaia',8096),@('TRACK',8102),@('CommandCenter',8098),@('Overlay',8099))
$monitorState = @{}
foreach ($m in $monitors) {
  $up = [bool](Test-NetConnection 127.0.0.1 -Port $m[1] -InformationLevel Quiet -WarningAction SilentlyContinue)
  $monitorState[$m[0]] = $up
  Say ("  {0,-14} :{1,-6} {2}" -f $m[0], $m[1], $(if ($up) { 'UP' } else { 'DOWN <<<' }))
}
$monitorsAllUp = -not ($monitorState.Values -contains $false)

# ---- 4. DID THE BOX STAY QUIET? --------------------------------------------------------------------
# Latch presence alone is NOT the answer. The whole defect that started this was a latch that said
# quiet while the box was slammed anyway, so the video core is measured directly.
Say "--- 4. did the box stay QUIET? (latch AND the actual processes) ---"
$latchPath = Join-Path $ROOT 'viewer\runtime\quiet_mode.json'
$latched = $false
try { if (Test-Path $latchPath) { $latched = [bool]((Get-Content -LiteralPath $latchPath -Raw | ConvertFrom-Json).quiet) } } catch {}
$obs = [bool](Get-Process obs64 -ErrorAction SilentlyContinue)
$mtx = [bool](Get-Process mediamtx -ErrorAction SilentlyContinue)
$chan = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
          Where-Object { ($_.CommandLine -like '*ch_colony*' -or $_.CommandLine -like '*ch_glass*' -or $_.CommandLine -like '*ch_overlook*') -and $_.CommandLine -notlike '*--type=*' }).Count
$videoCoreUp = ($obs -or $mtx -or ($chan -gt 0))
Say ("  latch quiet={0}   obs={1} mediamtx={2} channel_windows={3}" -f $latched, $obs, $mtx, $chan)

$reAsserted = $false
if ($videoCoreUp) {
  # The operator's standing instruction: the box STAYS QUIET until HE changes it. A slam after reboot
  # is a defect, and the correct response is to say so AND put it back - not to note it and move on.
  Say "  *** SLAMMED - the video core is running after a reboot. Re-asserting QUIET now. ***"
  try {
    $q = & node (Join-Path $ROOT 'viewer\quiet_mode.cjs') --quiet 2>&1
    foreach ($l in $q) { Say ("  | " + $l) }
    $reAsserted = $true
  } catch { Say ("  | re-assert EXCEPTION: " + $_.Exception.Message) }
  Start-Sleep -Seconds 3
  $obs = [bool](Get-Process obs64 -ErrorAction SilentlyContinue)
  $mtx = [bool](Get-Process mediamtx -ErrorAction SilentlyContinue)
  $chan = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
            Where-Object { ($_.CommandLine -like '*ch_colony*' -or $_.CommandLine -like '*ch_glass*' -or $_.CommandLine -like '*ch_overlook*') -and $_.CommandLine -notlike '*--type=*' }).Count
  $videoCoreUp = ($obs -or $mtx -or ($chan -gt 0))
  Say ("  after re-assert: obs={0} mediamtx={1} channel_windows={2}" -f $obs, $mtx, $chan)
}
$stayedQuiet = (-not $videoCoreUp)

# ---- 5. MEMORY (the thing the operator actually feels) ---------------------------------------------
$chrome = Get-Process chrome -ErrorAction SilentlyContinue
$chromeMb = if ($chrome) { [math]::Round((($chrome | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 0) } else { 0 }
Say ("--- 5. footprint: chrome procs={0} ram={1} MB ---" -f @($chrome).Count, $chromeMb)

# ---- VERDICT ---------------------------------------------------------------------------------------
$verdict = if ($hudProven -and $hudOk -and $monitorsAllUp -and $stayedQuiet) { 'PASS' }
           elseif ($hudOk -and $stayedQuiet) { 'PASS_WITH_NOTES' }
           else { 'FAIL' }
Say ("BOOT HEALTH VERDICT: {0}  (hud_proven={1} hud_serving={2} monitors_all_up={3} stayed_quiet={4} re_asserted_quiet={5})" -f `
     $verdict, $hudProven, $hudOk, $monitorsAllUp, $stayedQuiet, $reAsserted)
Say "================ END ================"

# Machine-readable, so the Door and the command center can SHOW the post-boot verdict rather than
# each re-deriving it (and disagreeing).
$result = [ordered]@{
  schema            = 'uni.hud.boot_health.v1'
  ran_at            = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
  last_boot         = $boot.ToString('yyyy-MM-ddTHH:mm:ssK')
  uptime_min_at_run = [math]::Round($uptimeMin, 1)
  verdict           = $verdict
  hud_reboot_proven = $hudProven
  hud_serving       = $hudOk
  hud_instrument    = $hudInstrument
  hud_service       = "$($svcHud.Status)"
  widget_launcher   = "$($svcLnch.Status)"
  widget_processes  = @($widget).Count
  monitors          = $monitorState
  monitors_all_up   = $monitorsAllUp
  quiet_latched     = $latched
  stayed_quiet      = $stayedQuiet
  re_asserted_quiet = $reAsserted
  chrome_procs      = @($chrome).Count
  chrome_ram_mb     = $chromeMb
  log               = $logFile
}
try {
  $rt = Split-Path $outJson; if (-not (Test-Path $rt)) { New-Item -ItemType Directory -Path $rt -Force | Out-Null }
  $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outJson -Encoding ascii
  Say "wrote $outJson"
} catch { Say ("could not write result json: " + $_.Exception.Message) }

try { $mutex.ReleaseMutex() } catch {}
if ($verdict -eq 'FAIL') { exit 1 } else { exit 0 }
