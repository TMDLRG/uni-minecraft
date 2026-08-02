# hud_service_install.ps1 - RETIRED 2026-07-14.
#
# ============================================================================
# RETIRED -- DO NOT RUN. Running this script would UNINSTALL the working
# native .NET UNI-HUD service and reinstall the OLD Node.js + NSSM stack,
# which no longer exists on disk in a servable form and is not maintained.
#
# The current, correct installer is:
#     viewer\hud\native\_swap_service_elevated.ps1
# (real ServiceBase via Microsoft.Extensions.Hosting.WindowsServices --
# no NSSM wrapper needed; the .exe implements the SCM control-handler
# protocol natively.)
#
# See docs/HUD.md and production/docs/adr/ADR-PROD-015-uni-hud-independent-surface.md
# for the full native architecture. This file is kept only for historical
# reference (the NSSM-era install ceremony) and refuses to run below.
# ============================================================================
#
# ---- ORIGINAL HEADER (historical, describes the retired NSSM mechanism) ----
# FIRST-OF-ITS-KIND in the repo: this is the first script that registers a
# real SCM-managed Windows Service (see ADR-PROD-015, now superseded).
# Mirrors the elevation discipline of apply_nrpt.ps1: IsInRole check +
# -VerifyOnly non-elevated escape hatch + big red ELEVATION REQUIRED message.
#
# Precedence: SCM UNI-HUD service is PRIMARY. hud_watchdog.ps1 stands down
# when Service-Running is true (see hud_watchdog.ps1 Ensure-Hud).
#
#   powershell -File viewer\hud\hud_service_install.ps1               # install (needs admin)
#   powershell -File viewer\hud\hud_service_install.ps1 -VerifyOnly   # read-only check (no admin needed)
#   powershell -File viewer\hud\hud_service_install.ps1 -Reinstall    # force fresh install (needs admin)
#
# WHAT IT DID (elevated path, NSSM era):
#   1. Locate nssm.exe (prefers viewer\hud\build\nssm.exe if present; else on PATH)
#   2. Locate the payload:
#      - preferred: viewer\hud\build\hud-server.exe (pkg-built .exe)
#      - fallback:  node.exe viewer\hud\hud_server.cjs (script mode)
#   3. nssm install UNI-HUD <path> [args]
#   4. nssm set UNI-HUD ObjectName "NT AUTHORITY\LocalService"
#   5. nssm set UNI-HUD Start SERVICE_AUTO_START
#   6. nssm set UNI-HUD AppStdout / AppStderr to logs\hud-svc.{out,err}.log
#   7. nssm start UNI-HUD
#   8. Verify RUNNING; also verify :8100 responds within 15 s
param(
  [switch]$VerifyOnly,
  [switch]$Reinstall,
  [switch]$IUnderstandThisIsRetiredAndWillDestroyTheWorkingService,
  [string]$ServiceName = 'UNI-HUD',
  [int]$Port = 8100
)

if (-not $VerifyOnly -and -not $IUnderstandThisIsRetiredAndWillDestroyTheWorkingService) {
  Write-Host "" -ForegroundColor Red
  Write-Host "RETIRED: this script targets the OLD NSSM/Node.js architecture." -ForegroundColor Red
  Write-Host "The working, registered UNI-HUD service today is native .NET (no NSSM)." -ForegroundColor Red
  Write-Host "Running this would tear it down and reinstall the retired stack." -ForegroundColor Red
  Write-Host "" -ForegroundColor Red
  Write-Host "Use instead: viewer\hud\native\_swap_service_elevated.ps1" -ForegroundColor Yellow
  Write-Host "" -ForegroundColor Red
  Write-Host "If you have read the above and genuinely intend to revert to the" -ForegroundColor Red
  Write-Host "retired NSSM stack, re-run with -IUnderstandThisIsRetiredAndWillDestroyTheWorkingService" -ForegroundColor Red
  exit 1
}
# Service account discipline (2026-07-14, binding): NEVER run this service under a
# person's user, NEVER prompt for a password. Machine identity only:
# LocalSystem for now (LocalService/NetworkService if we ever tighten it further).
# User-scoped observations (OBS crash sentinels, per-user AppData) belong to a
# separate user-mode helper (viewer/hud/hud_user_sight.ps1, runs in the operator's
# logon session via the Startup .vbs pattern) that POSTs findings back to this
# service via /api/hud/sight/push. See docs/HUD.md service-account section.
$ErrorActionPreference = 'Stop'
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$HUDDIR = Join-Path $ROOT 'viewer\hud'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }

function Log([string]$m,[string]$c='White') { Write-Host $m -ForegroundColor $c }
function Get-ServiceState { try { $s = Get-Service -Name $ServiceName -ErrorAction Stop; return @{present=$true; status=$s.Status; start=$s.StartType} } catch { return @{present=$false} } }
function Find-Nssm {
  $candidate = Join-Path $HUDDIR 'build\nssm.exe'
  if (Test-Path $candidate) { return $candidate }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path }
  return $null
}
function Find-Payload {
  $exe = Join-Path $HUDDIR 'build\hud-server.exe'
  if (Test-Path $exe) { return @{ path=$exe; args=@() } }
  # fallback: node.exe + script
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $null }
  $script = Join-Path $HUDDIR 'hud_server.cjs'
  if (-not (Test-Path $script)) { return $null }
  return @{ path=$node.Path; args=@($script) }
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($VerifyOnly) {
  Log "== VerifyOnly (no elevation needed, no mutation) ==" "Cyan"
  $s = Get-ServiceState
  if ($s.present) { Log "  service '$ServiceName' present: Status=$($s.status) StartType=$($s.start)" "Green" }
  else { Log "  service '$ServiceName' NOT installed" "Yellow" }
  $nssm = Find-Nssm; Log "  nssm.exe: $(if ($nssm) { $nssm } else { 'not found (install from https://nssm.cc or place at viewer\hud\build\nssm.exe)' })" $(if ($nssm) { 'Green' } else { 'Yellow' })
  $p = Find-Payload; Log "  payload: $(if ($p) { $p.path + ' ' + ($p.args -join ' ') } else { 'MISSING: build the .exe or ensure node.exe + hud_server.cjs' })" $(if ($p) { 'Green' } else { 'Red' })
  $portUp = [bool](Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)
  Log "  port $Port up : $portUp" $(if ($portUp) { 'Green' } else { 'Yellow' })
  exit 0
}

if (-not $isAdmin) {
  Log "ELEVATION REQUIRED. Close this window, right-click PowerShell, choose 'Run as administrator', re-run this script. (Read-only? re-run with -VerifyOnly, which needs no elevation.)" "Red"
  exit 1
}

$nssm = Find-Nssm
if (-not $nssm) {
  Log "nssm.exe not found. Install NSSM from https://nssm.cc/download OR place nssm.exe at viewer\hud\build\nssm.exe." "Red"
  exit 2
}
$payload = Find-Payload
if (-not $payload) {
  Log "No payload found. Build the .exe first ('pwsh viewer\hud\build_exe.ps1') OR ensure node.exe is on PATH and hud_server.cjs exists." "Red"
  exit 3
}

$state = Get-ServiceState
if ($state.present -and -not $Reinstall) {
  Log "service '$ServiceName' already installed (Status=$($state.status)). Use -Reinstall to force fresh install." "Yellow"
  Log "start check: & nssm start $ServiceName" "Yellow"
  exit 0
}

if ($state.present -and $Reinstall) {
  Log "-Reinstall: removing existing '$ServiceName' first" "Yellow"
  # Tolerate nssm's non-zero exit when service is already stopped -- expected
  # + benign. We locally lower ErrorActionPreference around the native calls.
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $nssm stop $ServiceName confirm 2>&1 | Out-Null } catch {}
  try { & $nssm remove $ServiceName confirm 2>&1 | Out-Null } catch {}
  $ErrorActionPreference = $prevEAP
  Start-Sleep 2
}

$svcArgs = $payload.args -join ' '
Log "installing '$ServiceName' -> $($payload.path) $svcArgs" "Cyan"
& $nssm install $ServiceName $payload.path $svcArgs | Out-Null
& $nssm set $ServiceName AppDirectory $ROOT | Out-Null
& $nssm set $ServiceName DisplayName "UNI HUD (always-on operator glance)" | Out-Null
& $nssm set $ServiceName Description "UNI HUD - the third independent surface (docs/HUD.md). Read-only aggregator over the Door + Gaia. Never opens a stream, never types CONFIRM." | Out-Null
& $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
# Service runs as LocalSystem. Machine identity only -- see the discipline
# comment at the top of this file. User-scoped observations (OBS crash sentinels,
# per-user AppData) are gathered by viewer/hud/hud_user_sight.ps1 which runs in
# the operator's logon session and POSTs to /api/hud/sight/push. That is the
# right two-tier shape; do not "solve" service-context visibility by widening
# the service's identity.
& $nssm set $ServiceName ObjectName "LocalSystem" | Out-Null
& $nssm set $ServiceName AppStdout (Join-Path $LOGDIR 'hud-svc.out.log') | Out-Null
& $nssm set $ServiceName AppStderr (Join-Path $LOGDIR 'hud-svc.err.log') | Out-Null
& $nssm set $ServiceName AppStopMethodSkip 0 | Out-Null    # graceful WM_CLOSE first
& $nssm set $ServiceName AppExit Default Restart | Out-Null # crash -> restart
# Capture the OPERATOR's home so the sight detectors (which read %APPDATA%
# for OBS crash-sentinel etc.) look at the operator's profile, not the
# LocalSystem profile the service actually runs under. Elevated shell's
# USERPROFILE is the operator's when the operator ran the UAC prompt.
$operatorHome = $env:USERPROFILE
if (-not $operatorHome) { $operatorHome = 'C:\Users\Public' }
& $nssm set $ServiceName AppEnvironmentExtra "HUD_OPERATOR_HOME=$operatorHome" "HUD_REPO_ROOT=$ROOT" | Out-Null
Log "service env: HUD_OPERATOR_HOME=$operatorHome HUD_REPO_ROOT=$ROOT" "Cyan"

# Register the UNI-HUD source in the Windows Application event log so
# hud_eventlog.cjs entries appear under the UNI-HUD source in eventvwr.msc
# instead of the generic 'Application' fallback. Source creation is admin-only
# (we're admin in this branch by construction), so this is the right moment.
try {
  if (-not [System.Diagnostics.EventLog]::SourceExists('UNI-HUD')) {
    New-EventLog -LogName Application -Source 'UNI-HUD'
    Log "registered event source 'UNI-HUD' under Application log" "Cyan"
  } else {
    Log "event source 'UNI-HUD' already registered" "Green"
  }
  # Optional: also let NSSM emit its own start/stop events under source 'nssm'
  # (it creates that automatically when it starts a service)
} catch {
  Log "WARN: could not register event source 'UNI-HUD' -- HUD will fall back to Application source. Detail: $($_.Exception.Message)" "Yellow"
}

Log "starting..." "Cyan"
# Tolerate nssm start non-zero exit for the same reason (state races); we
# verify via Get-Service + port probe below, not via nssm's exit code.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { & $nssm start $ServiceName 2>&1 | Out-Null } catch {}
$ErrorActionPreference = $prevEAP
Start-Sleep 3

# verify running + port up within 15s
$portUp = $false
for ($i=0; $i -lt 15; $i++) {
  if ([bool](Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)) { $portUp = $true; break }
  Start-Sleep 1
}
$state = Get-ServiceState
Log "---" "White"
Log "service         : $ServiceName" "White"
Log "status          : $($state.status)" $(if ($state.status -eq 'Running') { 'Green' } else { 'Red' })
Log "start type      : $($state.start)" $(if ($state.start -eq 'Automatic') { 'Green' } else { 'Yellow' })
Log "port $Port up   : $portUp" $(if ($portUp) { 'Green' } else { 'Red' })
if ($state.status -eq 'Running' -and $portUp) {
  Log "HUD SERVICE INSTALL: PASS" "Green"
  exit 0
}
Log "HUD SERVICE INSTALL: PARTIAL - service registered but not proven healthy. Check logs\hud-svc.err.log" "Yellow"
exit 4
