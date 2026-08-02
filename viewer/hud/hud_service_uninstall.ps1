# hud_service_uninstall.ps1 - remove the UNI-HUD Windows Service (reversal of hud_service_install.ps1).
# ASCII ONLY (PS 5.1). Requires admin.
#
#   powershell -File viewer\hud\hud_service_uninstall.ps1               # remove (needs admin)
#   powershell -File viewer\hud\hud_service_uninstall.ps1 -VerifyOnly   # read-only check
param([switch]$VerifyOnly, [string]$ServiceName = 'UNI-HUD')
$ErrorActionPreference = 'Stop'
function Log([string]$m,[string]$c='White') { Write-Host $m -ForegroundColor $c }
function Get-ServiceState { try { $s = Get-Service -Name $ServiceName -ErrorAction Stop; return @{present=$true; status=$s.Status; start=$s.StartType} } catch { return @{present=$false} } }
function Find-Nssm {
  $candidate = Join-Path (Split-Path -Parent $PSCommandPath) 'build\nssm.exe'
  if (Test-Path $candidate) { return $candidate }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path } else { return $null }
}
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$state = Get-ServiceState
if ($VerifyOnly) {
  if ($state.present) { Log "service '$ServiceName' present: Status=$($state.status)" "Yellow" }
  else { Log "service '$ServiceName' NOT installed" "Green" }
  exit 0
}
if (-not $isAdmin) {
  Log "ELEVATION REQUIRED. Right-click PowerShell -> Run as administrator, re-run. (-VerifyOnly needs no elevation.)" "Red"
  exit 1
}
if (-not $state.present) { Log "service '$ServiceName' not installed - nothing to remove" "Green"; exit 0 }
$nssm = Find-Nssm
if (-not $nssm) { Log "nssm.exe not found; cannot remove via NSSM. Use 'sc.exe delete $ServiceName' after 'sc.exe stop $ServiceName'." "Red"; exit 2 }
Log "stopping..." "Cyan"
& $nssm stop $ServiceName confirm 2>$null | Out-Null
Log "removing..." "Cyan"
& $nssm remove $ServiceName confirm | Out-Null
Start-Sleep 1
$after = Get-ServiceState
if (-not $after.present) { Log "HUD SERVICE UNINSTALL: PASS ('$ServiceName' removed)" "Green"; exit 0 }
Log "HUD SERVICE UNINSTALL: FAIL - service still present (Status=$($after.status))" "Red"
exit 3
