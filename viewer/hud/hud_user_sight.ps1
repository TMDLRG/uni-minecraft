# hud_user_sight.ps1 -- USER-MODE HELPER for the UNI HUD service.
# ASCII ONLY (PS 5.1).
#
# The UNI-HUD service runs as LocalSystem (machine identity -- the only right
# service-account choice; see docs/HUD.md). LocalSystem cannot see some paths
# in the operator's user profile (Windows enforces a per-user visibility
# fence on certain app-created dirs -- e.g. C:\Users\<op>\AppData\Roaming\
# obs-studio\.sentinel is invisible to SYSTEM even with FullControl ACL).
#
# THIS SCRIPT runs in the OPERATOR's logon session (installed as a Startup
# .vbs entry -- same pattern as door_boot_open.ps1 / gaia). It observes what
# only the operator can see, then POSTs findings to
# http://127.0.0.1:8100/api/hud/sight/push where the service merges them
# into /api/hud/sight for the HUD page + EventLog.
#
#   powershell -File viewer\hud\hud_user_sight.ps1                  # loop
#   powershell -File viewer\hud\hud_user_sight.ps1 -Once            # single push (tests/gate)
#   powershell -File viewer\hud\hud_user_sight.ps1 -IntervalSec 15  # tighter loop
param([switch]$Once, [int]$IntervalSec = 30, [int]$HudPort = 8100)
$ErrorActionPreference = 'SilentlyContinue'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'hud_user_sight.log'

function Write-Log([string]$m) {
  Add-Content -Path $LOG -Value ((Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " " + $m)
}

# Named mutex so multiple logons don't race a single service.
$script:mtx = New-Object System.Threading.Mutex($false, 'UNI_HUD_USER_SIGHT')
$got = $false
try { $got = $script:mtx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if (-not $got -and -not $Once) { Write-Log 'another hud_user_sight holds mutex - exiting'; exit 0 }

function Get-Findings {
  $findings = @()

  # (1) OBS crash-sentinel detector (the reason this helper exists)
  $sentDir = Join-Path $env:APPDATA 'obs-studio\.sentinel'
  if (Test-Path $sentDir) {
    $runs = @(Get-ChildItem $sentDir -Filter 'run_*' -ErrorAction SilentlyContinue)
    if ($runs.Count -gt 0) {
      $names = ($runs | Select-Object -First 3 -ExpandProperty Name) -join ', '
      $more = if ($runs.Count -gt 3) { ' ...' } else { '' }
      $findings += @{
        code = 'obs-sentinel-present'
        severity = 'warn'
        title = "OBS crash-marker present: next OBS start will Safe-Mode"
        detail = "$($runs.Count) sentinel file(s): $names$more. Heal: studio_up.ps1 removes .sentinel/ on start (self-heal). Never hand-launch OBS."
        source = "file://$sentDir"
      }
    }
  }

  # (2) OBS safe-mode marker in user.ini (harder crash-of-crash indicator)
  $userIni = Join-Path $env:APPDATA 'obs-studio\global.ini'
  if (Test-Path $userIni) {
    $iniContent = Get-Content $userIni -Raw -ErrorAction SilentlyContinue
    if ($iniContent -match 'LastCrashDate') {
      # Just flag the presence; the file always has this after first crash. Not necessarily current.
      # Skipping for now -- too noisy without a fresh timestamp check.
    }
  }

  # (3) OBS locale-load failure marker (per CLAUDE.md OBS chronic issue)
  $crashDir = Join-Path $env:APPDATA 'obs-studio\crashes'
  if (Test-Path $crashDir) {
    $recentCrashes = @(Get-ChildItem $crashDir -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-24) })
    if ($recentCrashes.Count -gt 0) {
      $findings += @{
        code = 'obs-crash-recent-24h'
        severity = 'warn'
        title = "OBS crashed $($recentCrashes.Count) time(s) in the last 24h"
        detail = "crash logs in $crashDir -- inspect + attach to any incident receipt. Newest: $($recentCrashes[0].Name) at $($recentCrashes[0].LastWriteTime)"
        source = "file://$crashDir"
      }
    }
  }

  # (4) Chrome profile-locks (per CLAUDE.md storm-breaker: command-center Chrome dedup)
  $chromeProfileDir = Join-Path $ROOT 'chrome-profiles'
  if (Test-Path $chromeProfileDir) {
    $locks = @(Get-ChildItem $chromeProfileDir -Recurse -Filter 'SingletonLock' -ErrorAction SilentlyContinue -Force)
    if ($locks.Count -gt 0) {
      $findings += @{
        code = 'chrome-profile-locks-present'
        severity = 'info'
        title = "$($locks.Count) Chrome profile lock file(s) present"
        detail = "SingletonLock files under chrome-profiles/. Usually benign (in-use marker); stale locks after a crash may block re-launch."
        source = "file://$chromeProfileDir"
      }
    }
  }

  return $findings
}

function Push-Findings([array]$findings) {
  $body = @{
    pushed_from = "hud_user_sight.ps1 as $env:USERDOMAIN\$env:USERNAME on $env:COMPUTERNAME"
    findings = $findings
  } | ConvertTo-Json -Depth 6 -Compress
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$HudPort/api/hud/sight/push" `
      -Method POST -Body $body -ContentType 'application/json' `
      -Headers @{ 'x-uni-cc' = '1' } -TimeoutSec 5 -UseBasicParsing
    return [PSCustomObject]@{ ok = $true; status = $r.StatusCode; body = $r.Content }
  } catch {
    return [PSCustomObject]@{ ok = $false; err = $_.Exception.Message }
  }
}

if ($Once) {
  $f = Get-Findings
  $res = Push-Findings $f
  Write-Log "-Once push: findings=$($f.Count) ok=$($res.ok) status=$($res.status) err=$($res.err)"
  if ($res.ok) { exit 0 } else { exit 1 }
}

Write-Log "hud_user_sight started (interval ${IntervalSec}s, port $HudPort, user=$env:USERDOMAIN\$env:USERNAME)"
while ($true) {
  $f = Get-Findings
  $res = Push-Findings $f
  if (-not $res.ok) { Write-Log "push failed: $($res.err)" }
  Start-Sleep -Seconds $IntervalSec
}
