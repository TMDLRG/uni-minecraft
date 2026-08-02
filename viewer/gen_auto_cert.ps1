# gen_auto_cert.ps1 - regenerate viewer/auto.crt + auto.key if missing or expiring.
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; UTF-8 em-dash breaks strings).
# Idempotent: skips when the existing cert's NotAfter is more than 30 days out.
# SAN: 127.0.0.1, ::1, plus the LAN IP read from viewer/channels.json (or defaults).
# openssl comes from git-for-windows (already installed on this box).
#
# Called by viewer/studio_up.ps1 before publisher.cjs / MediaMTX start.
# Manual run: powershell -File viewer\gen_auto_cert.ps1 [-Force]
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$crt  = Join-Path $root 'auto.crt'
$key  = Join-Path $root 'auto.key'
$rootAlsoCrt = Join-Path (Split-Path $root -Parent) 'auto.crt'
$rootAlsoKey = Join-Path (Split-Path $root -Parent) 'auto.key'
$openssl = "$env:ProgramFiles\Git\mingw64\bin\openssl.exe"
if (-not (Test-Path $openssl)) { $openssl = "$env:ProgramFiles\Git\usr\bin\openssl.exe" }
if (-not (Test-Path $openssl)) { throw 'openssl not found - install git-for-windows or edit gen_auto_cert.ps1' }

# LAN IP - prefer viewer/channels.json { host: "<ip>" }, fall back to a sensible default.
$lanIp = '10.190.245.196'
$chan = Join-Path $root 'channels.json'
if (Test-Path $chan) {
  try { $j = Get-Content $chan -Raw | ConvertFrom-Json; if ($j.host) { $lanIp = [string]$j.host } } catch {}
}

# Idempotent check.
if (-not $Force -and (Test-Path $crt)) {
  try {
    $x = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $crt
    $daysLeft = [int]($x.NotAfter - (Get-Date)).TotalDays
    if ($daysLeft -gt 30) {
      "auto.crt valid for $daysLeft more days (NotAfter=$($x.NotAfter.ToString('u'))) - skipping regen. Use -Force to override."
      exit 0
    }
    "auto.crt expires in $daysLeft days - regenerating"
  } catch {
    "auto.crt unreadable - regenerating"
  }
}

# openssl v1.1.1 does not accept SAN inline; write a temp config.
$cfg = Join-Path $env:TEMP ('uni_openssl_' + [guid]::NewGuid().ToString('n') + '.cnf')
$body = @"
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = uni-studio ($lanIp)
[v3]
subjectAltName = DNS:localhost,IP:127.0.0.1,IP:::1,IP:$lanIp
basicConstraints = CA:false
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
"@
Set-Content -Path $cfg -Value $body -Encoding ascii -NoNewline

try {
  "gen_auto_cert: openssl req -newkey rsa:2048 -x509 -days 3650 -SAN 127.0.0.1,::1,$lanIp"
  # PS 5.1 wraps every line a native exe writes to stderr as a NativeCommandError
  # under $ErrorActionPreference='Stop' as soon as it is redirected (2>&1 OR
  # 2>$null both trigger the wrap). openssl writes RSA-key progress dots to
  # stderr - not errors, but PS treats them as terminating. Don't redirect;
  # swallow the wrapped record in a nested try/catch and judge success by
  # $LASTEXITCODE + the produced files.
  try {
    & $openssl req -x509 -nodes -newkey rsa:2048 -keyout $key -out $crt -days 3650 -config $cfg | Out-Null
  } catch [System.Management.Automation.RemoteException] {
    # native stderr wrapped by PS 5.1 - not a real error, keep going
  }
  if ($LASTEXITCODE -ne 0) { throw "openssl exited $LASTEXITCODE" }
  if (-not (Test-Path $crt) -or -not (Test-Path $key)) { throw 'openssl did not produce cert/key' }
} finally {
  Remove-Item $cfg -Force -ErrorAction SilentlyContinue
}

# Also copy the fresh pair to the repo root -- untracked files at that path are read by other
# tools (mediamtx_local.yml uses viewer/auto.{crt,key} directly, but a couple of shellouts have
# hard-coded relative paths from cwd=repo root). Keeping both in sync avoids "the second copy
# expired" mysteries.
Copy-Item $crt $rootAlsoCrt -Force -ErrorAction SilentlyContinue
Copy-Item $key $rootAlsoKey -Force -ErrorAction SilentlyContinue

$x = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $crt
"auto.crt regenerated. NotAfter = $($x.NotAfter.ToString('u')) ; SAN includes 127.0.0.1, ::1, $lanIp"
