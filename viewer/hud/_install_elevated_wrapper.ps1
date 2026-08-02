# _install_elevated_wrapper.ps1 -- runs hud_service_install.ps1 elevated,
# tees output to logs/hud_svc_install.log, then drops a completion marker so
# a non-elevated caller can detect completion + read the result.
$ErrorActionPreference = 'Continue'
$ROOT = 'C:\Users\mpolz\Documents\UNI.Minecraft'
$LOGDIR = Join-Path $ROOT 'logs'
if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG    = Join-Path $LOGDIR 'hud_svc_install.log'
$MARKER = Join-Path $LOGDIR 'hud_svc_install.done'
if (Test-Path $MARKER) { Remove-Item $MARKER -Force }

"---- BEGIN " + (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + " ----" | Out-File -FilePath $LOG -Encoding utf8
"cwd=$(Get-Location); user=$env:USERNAME" | Out-File -Append $LOG -Encoding utf8
"IsAdmin=$([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))" | Out-File -Append $LOG -Encoding utf8
"" | Out-File -Append $LOG -Encoding utf8

$installScript = Join-Path $ROOT 'viewer\hud\hud_service_install.ps1'
try {
  & $installScript -Reinstall *>&1 | Out-File -Append -FilePath $LOG -Encoding utf8
  $exit = $LASTEXITCODE
} catch {
  "EXCEPTION: $($_.Exception.Message)" | Out-File -Append $LOG -Encoding utf8
  $exit = 99
}
"" | Out-File -Append $LOG -Encoding utf8
"---- END exit=$exit ----" | Out-File -Append $LOG -Encoding utf8
$exit | Out-File -FilePath $MARKER -Encoding utf8
