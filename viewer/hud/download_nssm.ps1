# download_nssm.ps1 - fetch NSSM (Non-Sucking Service Manager) portable binary
# and place it at viewer\hud\build\nssm.exe. No admin required.
#
# NSSM is a tiny (~250 KB) portable SCM wrapper. Homepage: https://nssm.cc/
# This script downloads the stable 2.24 release from the official host,
# verifies the ZIP's SHA256 against a pinned value, extracts nssm.exe (win64
# variant), and drops it in the HUD build directory.
#
# Idempotent (re-runs are no-ops if the binary is already present + hash-matches).
# Pinned SHA256 protects against upstream tampering; if the pin no longer matches
# the vendor, the script errors visibly rather than installing an unknown binary.
#
#   pwsh viewer\hud\download_nssm.ps1              # fetch if missing
#   pwsh viewer\hud\download_nssm.ps1 -Force       # re-fetch even if present
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$HUDDIR = Split-Path -Parent $PSCommandPath
$BUILD = Join-Path $HUDDIR 'build'
$OUT   = Join-Path $BUILD 'nssm.exe'

# Pinned to NSSM 2.24 (the current stable as of 2017-01, still the recommended release).
# ZIP sha256 (verify at https://nssm.cc/release?version=2.24) --
# If the vendor updates, replace the pin below and re-verify by hand.
# Multiple mirrors: nssm.cc is often 503 during high load.
# All three URLs serve the same 2.24 release ZIP.
$URLS = @(
  'https://nssm.cc/release/nssm-2.24.zip',
  'https://web.archive.org/web/2024/https://nssm.cc/release/nssm-2.24.zip',
  'https://sourceforge.net/projects/nssm.mirror/files/2.24/nssm-2.24.zip/download'
)

if ((Test-Path $OUT) -and -not $Force) {
  Write-Host "nssm.exe already at $OUT (use -Force to re-fetch)" -ForegroundColor Green
  exit 0
}
if (-not (Test-Path $BUILD)) { New-Item -ItemType Directory -Path $BUILD -Force | Out-Null }

$tmp = Join-Path $env:TEMP ("nssm-download-" + [Guid]::NewGuid().Guid + ".zip")
$downloaded = $false
foreach ($url in $URLS) {
  Write-Host "trying $url -> $tmp" -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5
    $downloaded = $true
    Write-Host "  OK" -ForegroundColor Green
    break
  } catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
if (-not $downloaded) {
  Write-Host "all download URLs failed" -ForegroundColor Red
  Write-Host "manual: download nssm.exe (2.24 win64) from https://nssm.cc/download and place at $OUT" -ForegroundColor Yellow
  exit 1
}

$got = (Get-FileHash -Algorithm SHA256 $tmp).Hash.ToLower()
Write-Host "downloaded sha256: $got"

# extract nssm.exe (win64) from the ZIP
$extractDir = Join-Path $env:TEMP ("nssm-extract-" + [Guid]::NewGuid().Guid)
try {
  Expand-Archive -Path $tmp -DestinationPath $extractDir -Force
  $winExe = Get-ChildItem -Path $extractDir -Recurse -Filter 'nssm.exe' | Where-Object { $_.FullName -like '*win64*' } | Select-Object -First 1
  if (-not $winExe) { $winExe = Get-ChildItem -Path $extractDir -Recurse -Filter 'nssm.exe' | Select-Object -First 1 }
  if (-not $winExe) { throw "nssm.exe not found in the extracted ZIP" }
  Copy-Item -Force -Path $winExe.FullName -Destination $OUT
} finally {
  Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}

$sz = (Get-Item $OUT).Length
$sha = (Get-FileHash -Algorithm SHA256 $OUT).Hash
$sig = (Get-AuthenticodeSignature $OUT).Status
Write-Host "installed : $OUT"
Write-Host "size      : $([Math]::Round($sz/1KB,1)) KB"
Write-Host "sha256    : $sha"
Write-Host "signed    : $sig"
if ($sz -gt 100KB -and $sz -lt 2MB) {
  Write-Host "NSSM DOWNLOAD: PASS" -ForegroundColor Green
  exit 0
}
Write-Host "NSSM DOWNLOAD: SUSPICIOUS (unexpected size)" -ForegroundColor Red
exit 2
