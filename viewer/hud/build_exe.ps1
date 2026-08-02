# build_exe.ps1 - bundle hud_server.cjs into a single Windows .exe via @yao-pkg/pkg.
# ASCII ONLY (PS 5.1).
#
# FIRST-OF-ITS-KIND in the repo: this is the first script that produces a
# native Windows .exe from a .cjs (see ADR-PROD-015). It reads its config from
# viewer\hud\package.json's "pkg" section. No admin required.
#
#   pwsh viewer\hud\build_exe.ps1              # build hud-server.exe (~30-50 MB)
#   pwsh viewer\hud\build_exe.ps1 -Clean       # delete build\ first, then build
#   pwsh viewer\hud\build_exe.ps1 -InstallDeps # npm install (--only=dev) first
param([switch]$Clean, [switch]$InstallDeps)
$ErrorActionPreference = 'Stop'
$HUDDIR = Split-Path -Parent $PSCommandPath
$BUILDDIR = Join-Path $HUDDIR 'build'
$OUTEXE = Join-Path $BUILDDIR 'hud-server.exe'

function Log([string]$m,[string]$c='White') { Write-Host $m -ForegroundColor $c }

Push-Location $HUDDIR
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node.exe not on PATH" }
  if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { throw "npm not on PATH" }

  if ($Clean -and (Test-Path $BUILDDIR)) {
    Log "cleaning $BUILDDIR" "Yellow"
    Remove-Item -Recurse -Force $BUILDDIR
  }
  if (-not (Test-Path $BUILDDIR)) { New-Item -ItemType Directory -Force -Path $BUILDDIR | Out-Null }

  if ($InstallDeps -or -not (Test-Path (Join-Path $HUDDIR 'node_modules\@yao-pkg\pkg'))) {
    Log "installing dev deps (@yao-pkg/pkg) into viewer/hud/ ..." "Cyan"
    npm install --no-audit --no-fund --loglevel=warn 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }

  Log "running @yao-pkg/pkg on hud_server.cjs -> $OUTEXE" "Cyan"
  # pkg reads targets + assets from package.json "pkg" section
  npx @yao-pkg/pkg hud_server.cjs 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "@yao-pkg/pkg failed" }

  # normalize output name to hud-server.exe (@yao-pkg/pkg defaults to <name>-win.exe)
  $candidate = Get-ChildItem $BUILDDIR -Filter '*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $candidate) { throw "no .exe produced under $BUILDDIR" }
  if ($candidate.FullName -ne $OUTEXE) { Move-Item -Force $candidate.FullName $OUTEXE }

  $size = (Get-Item $OUTEXE).Length
  $sha  = (Get-FileHash -Algorithm SHA256 $OUTEXE).Hash
  $mz   = ([System.IO.File]::ReadAllBytes($OUTEXE) | Select-Object -First 2)
  $mzOk = ($mz[0] -eq 0x4D -and $mz[1] -eq 0x5A)

  Log "---" "White"
  Log "output    : $OUTEXE" "White"
  Log "size      : $([Math]::Round($size/1MB,1)) MB" "White"
  Log "sha256    : $sha" "White"
  Log "MZ header : $mzOk" $(if ($mzOk) { 'Green' } else { 'Red' })
  if ($mzOk -and $size -gt 1MB) {
    Log "HUD BUILD: PASS - a real Windows .exe was produced." "Green"
    exit 0
  }
  Log "HUD BUILD: FAIL - .exe missing MZ header or too small" "Red"
  exit 1
} finally { Pop-Location }
