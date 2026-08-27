# install_lan_cert.ps1 -- trust the LAN's self-signed certs so CEF (OBS's browser source) and every
# browser on this box loads glass/producer/horologium/etc. WITHOUT a warning page.
#
# THE PROBLEM this exists to solve (found LIVE 2026-07-17): OBS's CEF browser source silently
# refuses to load a self-signed HTTPS URL -- there is NO way to click through in CEF as there is in
# a normal browser. cap_web renders BLACK. Same on any future cap_web navigation to LAN HTTPS.
#
# THE FIX: install the LAN server cert into `Cert:\CurrentUser\Root`. Modern OBS/CEF consult the
# Windows user trust store on Windows, so this makes CEF, Edge, Chrome, and any browser trust the
# cert with no per-page warning. CurrentUser scope needs NO elevation.
#
# This script is IDEMPOTENT: an already-installed cert is a no-op. Safe to run at every studio
# bring-up (wired into studio_up.ps1).

$ErrorActionPreference = 'Continue'
$LOGDIR = 'C:\Users\mpolz\Documents\UNI.Minecraft\logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'install_lan_cert.log'
function L($m) { "[$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')] $m" | Out-File -Append $LOG }
L "---- BEGIN ----"

# Resolve the LAN hosts we need CEF to trust. Same names host_resolve.cjs uses, so this stays in
# sync with the registry: any name that answers gets its cert imported.
$hosts = @('glass','producer','colony','colonycam','music','cams','launcher','overlays')
$imported = 0
$skipped = 0
$errors = 0

foreach ($name in $hosts) {
    $fqdn = "$name.uni-lab.local"
    $addr = $null
    try {
        $r = Resolve-DnsName -Name $fqdn -Type A -QuickTimeout -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -First 1
        if ($r) { $addr = $r.IPAddress }
    } catch {}
    if (-not $addr) { L "  $fqdn -> no DNS answer, skip"; $skipped++; continue }

    # Pull the cert from the live TLS handshake -- no dependency on a checked-in .cer file that
    # would rot the first time a host is re-issued.
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.ReceiveTimeout = 3000
        $tcp.SendTimeout = 3000
        $tcp.Connect($addr, 443)
        $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, { $true })
        $ssl.AuthenticateAsClient($fqdn)
        $bytes = $ssl.RemoteCertificate.GetRawCertData()
        $ssl.Dispose(); $tcp.Close()
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,$bytes)
    } catch {
        L "  $fqdn ($addr): TLS fetch failed - $_"
        $errors++
        continue
    }

    $thumb = $cert.Thumbprint
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
    $store.Open('ReadWrite')
    $existing = $store.Certificates | Where-Object { $_.Thumbprint -eq $thumb }
    if ($existing) {
        L "  $fqdn ($addr) [$thumb] -> already trusted, skip"
        $skipped++
    } else {
        $store.Add($cert)
        L "  $fqdn ($addr) [$thumb] subject='$($cert.Subject)' expires=$($cert.NotAfter) -> INSTALLED into CurrentUser\Root"
        $imported++
    }
    $store.Close()
}

L "imported=$imported  skipped=$skipped  errors=$errors"
L "---- END ----"
Write-Output "install_lan_cert: imported=$imported skipped=$skipped errors=$errors  (log: $LOG)"
