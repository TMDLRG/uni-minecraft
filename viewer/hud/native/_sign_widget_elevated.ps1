# _sign_widget_elevated.ps1 — runs elevated. Re-signs ONLY the widget exe with
# the existing LocalMachine\My "UNI-HUD Local Signing" cert (does NOT touch the
# running service exe, which is locked while UNI-HUD runs). Used after a widget
# rebuild. Writes result to logs/sign_widget.log + a .done marker with the exit code.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR 'sign_widget.log'
$MARKER = Join-Path $LOGDIR 'sign_widget.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }
"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File $LOG -Encoding utf8
try {
    $subject = "CN=UNI-HUD Local Signing (self-signed), O=solutionwright"
    $cert = Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $subject } | Select-Object -First 1
    if (-not $cert) { throw "signing cert not found in LocalMachine\My: $subject" }
    "using cert thumb=$($cert.Thumbprint)" | Out-File -Append $LOG

    $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $signtool) { throw "signtool.exe not found" }
    "signtool: $($signtool.FullName)" | Out-File -Append $LOG

    $t = Join-Path $ROOT 'viewer\hud\native\publish\widget\UNI.Hud.Widget.exe'
    if (-not (Test-Path $t)) { throw "widget exe missing: $t" }
    "signing $t ..." | Out-File -Append $LOG
    & $signtool.FullName sign /sm /sha1 $cert.Thumbprint /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com $t *>&1 | Out-File -Append $LOG
    "verifying ..." | Out-File -Append $LOG
    & $signtool.FullName verify /pa /v $t *>&1 | Select-Object -First 12 | Out-File -Append $LOG
    $sig = Get-AuthenticodeSignature $t
    "Get-AuthenticodeSignature: Status=$($sig.Status) Signer=$($sig.SignerCertificate.Subject)" | Out-File -Append $LOG
    if ($sig.Status -eq 'Valid') { $exit = 0 } else { $exit = 1 }
} catch {
    "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG
    $exit = 99
}
"---- END exit=$exit ----" | Out-File -Append $LOG
$exit | Out-File $MARKER -Encoding utf8
