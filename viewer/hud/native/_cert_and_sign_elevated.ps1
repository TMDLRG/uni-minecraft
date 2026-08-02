# _cert_and_sign_elevated.ps1 — runs elevated. Creates a self-signed
# code-signing cert, installs it to LocalMachine\Root (so Windows trusts it
# locally), signs both UNI.Hud.Service.exe + UNI.Hud.Widget.exe with signtool,
# and verifies each signature. Writes result to logs/cert_and_sign.log.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'cert_and_sign.log'
$MARKER = Join-Path $LOGDIR 'cert_and_sign.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File $LOG -Encoding utf8
"IsAdmin=$([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))" | Out-File -Append $LOG
"" | Out-File -Append $LOG

try {
    $subject = "CN=UNI-HUD Local Signing (self-signed), O=solutionwright"
    # Reuse if already present
    $existing = Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $subject }
    if ($existing) {
        "found existing cert: thumb=$($existing.Thumbprint)" | Out-File -Append $LOG
        $cert = $existing | Select-Object -First 1
    } else {
        "creating new self-signed cert: $subject" | Out-File -Append $LOG
        $cert = New-SelfSignedCertificate -Type CodeSigning `
            -Subject $subject `
            -CertStoreLocation Cert:\LocalMachine\My `
            -KeyUsage DigitalSignature `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -NotAfter (Get-Date).AddYears(3) `
            -HashAlgorithm SHA256 `
            -FriendlyName 'UNI-HUD Local Signing'
        "created: thumb=$($cert.Thumbprint)" | Out-File -Append $LOG
    }

    # Install cert to Trusted Root Certification Authorities (local machine) so signatures verify without a CA
    $rootStore = Get-Item Cert:\LocalMachine\Root
    $rootStore.Open('ReadWrite')
    if (-not ($rootStore.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint })) {
        $rootStore.Add($cert)
        "installed cert to LocalMachine\Root" | Out-File -Append $LOG
    } else {
        "cert already in LocalMachine\Root" | Out-File -Append $LOG
    }
    $rootStore.Close()

    # Locate signtool
    $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $signtool) { throw "signtool.exe not found" }
    "signtool: $($signtool.FullName)" | Out-File -Append $LOG

    # Sign both exes using the cert (by thumbprint, from LocalMachine\My)
    $targets = @(
        (Join-Path $ROOT 'viewer\hud\native\publish\service\UNI.Hud.Service.exe'),
        (Join-Path $ROOT 'viewer\hud\native\publish\widget\UNI.Hud.Widget.exe')
    )
    foreach ($t in $targets) {
        if (-not (Test-Path $t)) { "MISSING target: $t" | Out-File -Append $LOG; continue }
        "signing $t ..." | Out-File -Append $LOG
        # /sm = search LocalMachine store (not CurrentUser). /a = auto-select best cert.
        & $signtool.FullName sign /sm /sha1 $cert.Thumbprint /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com $t *>&1 | Out-File -Append $LOG
        # verify
        "verifying $t ..." | Out-File -Append $LOG
        & $signtool.FullName verify /pa /v $t *>&1 | Select-Object -First 20 | Out-File -Append $LOG
        # also via .NET (Get-AuthenticodeSignature is the friendliest report)
        $sig = Get-AuthenticodeSignature $t
        "  Get-AuthenticodeSignature: Status=$($sig.Status) SignerCert=$($sig.SignerCertificate.Subject)" | Out-File -Append $LOG
    }
    $exit = 0
} catch {
    "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG
    $exit = 99
}
"---- END exit=$exit ----" | Out-File -Append $LOG
$exit | Out-File $MARKER -Encoding utf8
