# gen_auto_cert.ps1 - regenerate viewer/auto.crt + auto.key so the cert covers EVERY network
# plane this box currently sits on, and REGENERATES ITSELF when the box joins a new one.
# ASCII ONLY (PS 5.1 reads BOM-less files as ANSI; UTF-8 em-dash breaks strings).
# openssl comes from git-for-windows (already installed on this box).
#
# Called by viewer/studio_up.ps1 before publisher.cjs / MediaMTX start.
# Manual run: powershell -File viewer\gen_auto_cert.ps1 [-Force]
#
# ---------------------------------------------------------------------------------------------
# WHY THIS FILE WAS REWRITTEN (2026-08-03) - the defect, stated so it cannot be reintroduced.
#
# The previous version did two things that combined into a ten-year silent outage:
#
#   1. It hard-coded ONE LAN address ($lanIp = '10.190.245.196') and put exactly that one address
#      in the SAN. THINKER sits on THREE planes - Ethernet, Wi-Fi and Tailscale - and the cert
#      described one of them.
#   2. It skipped regeneration whenever the existing cert had more than 30 days left, and it
#      minted certs with -days 3650. So the cert could not refresh itself until 2036.
#
# Measured consequence on 2026-08-03: the operator's laptop moved from the Kilig LAN to the P-Zin
# WLAN. The old LAN address became unroutable (ERR_CONNECTION_TIMED_OUT - correct, different
# subnet), and the Wi-Fi address, which WAS reachable, hard-failed TLS because the cert had never
# heard of it. The service had been up the entire time. Both failures presented as "it does not
# load", and neither was the server.
#
# The fix is that the SAN set is now DISCOVERED, never declared:
#   - every non-loopback IPv4 this box currently holds, read from the OS at generation time;
#   - loopback v4/v6;
#   - this machine's own hostname;
#   - the Tailscale MagicDNS name, read live from `tailscale status --json` - the only name that
#     resolves the same from ANY network;
#   - plus the declared zone/public names in viewer/cert_names.json (data, not literals in code).
#
# And the idempotency check now tests COVERAGE, not just expiry: if the box holds an address the
# cert does not carry, it regenerates. That is what makes it durable - the cert follows the box
# onto new networks instead of freezing on the one it was born on.
#
# NOTE: a name in the SAN does not make that name RESOLVE. DNS is a separate concern. This only
# guarantees that if a name or address reaches this box, the handshake succeeds.
# ---------------------------------------------------------------------------------------------
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

# ---- DISCOVER every address this box holds. No literals: ask the OS. ----------------------
# APIPA (169.254/16) is excluded - those are unconfigured-adapter addresses, never a service path.
$ipList = @()
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { if ($ipList -notcontains $_.IPAddress) { $ipList += $_.IPAddress } }
$ipList = $ipList | Sort-Object

# ---- DISCOVER the names. ------------------------------------------------------------------
$dnsList = @('localhost')
$hn = $env:COMPUTERNAME
if ($hn) {
  $hn = $hn.ToLower()
  if ($dnsList -notcontains $hn) { $dnsList += $hn }
}

# Tailscale MagicDNS name - the one name that resolves identically from every network, which is
# precisely the property the old cert lacked. Read live; absent tailscale is not an error.
$tsExe = "$env:ProgramFiles\Tailscale\tailscale.exe"
if (Test-Path $tsExe) {
  try {
    $tsJson = & $tsExe status --json
    if ($LASTEXITCODE -eq 0 -and $tsJson) {
      $ts = ($tsJson -join "`n") | ConvertFrom-Json
      if ($ts.Self -and $ts.Self.DNSName) {
        $tsName = ([string]$ts.Self.DNSName).TrimEnd('.')
        if ($tsName -and $dnsList -notcontains $tsName) { $dnsList += $tsName }
      }
      if ($ts.Self -and $ts.Self.TailscaleIPs) {
        foreach ($t in $ts.Self.TailscaleIPs) {
          $t = [string]$t
          if ($t -notmatch ':' -and $ipList -notcontains $t) { $ipList += $t }
        }
      }
    }
  } catch { "gen_auto_cert: tailscale status unreadable - continuing without its name" }
}

# Declared zone / public names (data file, so no hostname literal lives in this script).
$namesFile = Join-Path $root 'cert_names.json'
if (Test-Path $namesFile) {
  try {
    $nf = Get-Content $namesFile -Raw | ConvertFrom-Json
    foreach ($n in $nf.dns_names) {
      $n = ([string]$n).Trim()
      if ($n -and $dnsList -notcontains $n) { $dnsList += $n }
    }
  } catch { "gen_auto_cert: cert_names.json unreadable - continuing with discovered names only" }
}

if ($ipList.Count -eq 0) { throw 'gen_auto_cert: no non-loopback IPv4 address found - refusing to mint a loopback-only cert' }

# ---- Read the SAN entries a cert actually carries, as an exact set. ------------------------
# Parses the "DNS Name=x" / "IP Address=y" lines rather than regex-matching the blob, because a
# substring match reports coverage that is not there. That is the same class of error this whole
# file exists to correct.
function Get-SanValues([string]$certPath) {
  $out = @()
  try {
    $cc = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certPath
    $ext = $cc.Extensions | Where-Object { $_.Oid.FriendlyName -like '*Subject Alternative Name*' }
    if (-not $ext) { return $out }
    foreach ($line in ($ext.Format($true) -split "`r?`n")) {
      $line = $line.Trim()
      if ($line -eq '') { continue }
      $eq = $line.IndexOf('=')
      if ($eq -lt 0) { continue }
      $out += $line.Substring($eq + 1).Trim()
    }
  } catch { }
  return $out
}

# ---- COVERAGE CHECK (replaces the expiry-only check that let the cert freeze for ten years) ----
# Regenerate when the cert is expiring OR when it fails to cover something this box now holds.
# IPv4 + DNS entries only: the IPv6 loopback renders in expanded form and comparing it adds
# fragility for no signal. Stated rather than hidden.
$reason = 'forced with -Force'
if (-not (Test-Path $crt)) {
  $reason = 'no existing cert'
} elseif (-not $Force) {
  try {
    $x = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $crt
    $daysLeft = [int]($x.NotAfter - (Get-Date)).TotalDays
    $have = Get-SanValues $crt
    $missing = @()
    foreach ($ip in $ipList)  { if ($have -notcontains $ip) { $missing += ("IP:" + $ip) } }
    foreach ($d  in $dnsList) { if ($have -notcontains $d)  { $missing += ("DNS:" + $d) } }
    if ($daysLeft -le 30) {
      $reason = "expires in $daysLeft days"
    } elseif ($missing.Count -gt 0) {
      $reason = "cert does not cover " + ($missing -join ', ')
    } else {
      "auto.crt already covers all $($ipList.Count) address(es) and $($dnsList.Count) name(s); valid $daysLeft more days - skipping regen. Use -Force to override."
      exit 0
    }
  } catch {
    $reason = 'auto.crt unreadable'
  }
}
"gen_auto_cert: regenerating - $reason"

# openssl v1.1.1 does not accept SAN inline; write a temp config.
#
# Built one entry at a time and joined with [string]::Join. The first version of this rewrite
# used nested `-join` calls inside an array literal; the outer join did not apply, the groups
# were separated by SPACES instead of commas, and openssl STILL EXITED 0 -- silently folding
# `IP:127.0.0.1 IP:::1 IP:10.190.245.196` into the tail of a DNS name. The minted cert lost
# loopback AND the Ethernet address, which is the one path that was still working. Caught only
# by reading the artifact back. Do not reintroduce a nested join here.
$sanEntries = @()
foreach ($d in $dnsList) { $sanEntries += ('DNS:' + $d) }
$sanEntries += 'IP:127.0.0.1'
$sanEntries += 'IP:::1'
foreach ($ip in $ipList) { $sanEntries += ('IP:' + $ip) }
$san = [string]::Join(',', $sanEntries)
$cfg = Join-Path $env:TEMP ('uni_openssl_' + [guid]::NewGuid().ToString('n') + '.cnf')
$body = @"
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = uni-studio ($hn)
[v3]
subjectAltName = $san
basicConstraints = CA:false
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
"@
Set-Content -Path $cfg -Value $body -Encoding ascii -NoNewline

try {
  "gen_auto_cert: SAN = $san"
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

# ---- VERIFY THE ARTIFACT, NOT THE EXIT CODE. --------------------------------------------------
# openssl returned 0 on a cert that had silently dropped loopback and the Ethernet address. An
# exit code says the command ran; it does not say the cert covers what we asked for. Read the
# minted cert back and FAIL LOUDLY on any intended entry that is missing.
$have = Get-SanValues $crt
$missing = @()
foreach ($d  in $dnsList) { if ($have -notcontains $d)  { $missing += ("DNS:" + $d) } }
foreach ($ip in $ipList)  { if ($have -notcontains $ip) { $missing += ("IP:" + $ip) } }
if ($have -notcontains '127.0.0.1') { $missing += 'IP:127.0.0.1' }
if ($missing.Count -gt 0) {
  "VERIFY FAILED - the minted cert does not carry: " + ($missing -join ', ')
  "  it carries: " + ($have -join ', ')
  throw 'gen_auto_cert: minted cert failed SAN verification - NOT usable'
}

$x = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $crt
"auto.crt regenerated and VERIFIED. NotAfter = $($x.NotAfter.ToString('u'))"
"  SAN entries read back from the cert ($($have.Count)):"
foreach ($h in $have) { "     $h" }
""
"NOTE: a running publisher.cjs / MediaMTX still holds the OLD cert in memory."
"      Restart them to serve the new one."
