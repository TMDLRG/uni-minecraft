# hud_widget_boot_install.ps1 - RETIRED 2026-07-18. Do not use for install.
#
# The HUD widget no longer boots from a per-user Startup .vbs. The boot/logon launch is now
# the compiled UNI-HUD-WidgetLauncher Windows service, which registers + triggers the native
# Windows Scheduled Task "UNI\HUD Widget" (interactive-token, at-logon, restart-on-failure).
# Install it with:  _install_widget_launcher_elevated.ps1  (elevated).  A Startup .vbs would
# be a SECOND, competing launch path that fights the service (the launcher installer even
# deletes it), so this script refuses to install. -Remove / -Status still work to clean up or
# inspect any leftover legacy .vbs. Receipt: docs/receipts/hud_widget_launcher_taskscheduler_2026-07-18.md
#
#   ... -Remove   # remove any leftover legacy Startup .vbs
#   ... -Status   # show whether a legacy Startup .vbs is still present
param([switch]$Remove, [switch]$Status)
$ErrorActionPreference = 'Stop'
if (-not ($Remove -or $Status)) {
  Write-Host ""
  Write-Host "RETIRED: the HUD widget boots via the compiled UNI-HUD-WidgetLauncher service +"
  Write-Host "the native Scheduled Task 'UNI\HUD Widget', NOT a Startup .vbs."
  Write-Host "Install with:  viewer\hud\native\_install_widget_launcher_elevated.ps1  (elevated)."
  Write-Host "Use -Remove to clean up any leftover legacy .vbs, or -Status to inspect."
  exit 2
}
$NATIVE_DIR = $PSScriptRoot
$VBS_SRC    = Join-Path $NATIVE_DIR 'hud_widget_open.vbs'
$EXE        = Join-Path $NATIVE_DIR 'publish\widget\UNI.Hud.Widget.exe'
$STARTUP    = [Environment]::GetFolderPath('Startup')
$LNK        = Join-Path $STARTUP 'UNI-HUD-Widget.vbs'

if ($Status) {
  "startup_launcher : $LNK"
  "installed        : $(Test-Path $LNK)"
  "widget exe        : $EXE"
  "exe present       : $(Test-Path $EXE)"
  exit 0
}
if ($Remove) {
  if (Test-Path $LNK) { Remove-Item $LNK -Force }
  "uninstalled: present = $(Test-Path $LNK)"
  exit 0
}
if (-not (Test-Path $VBS_SRC)) { throw "hud_widget_open.vbs not found at $VBS_SRC" }
if (-not (Test-Path $EXE))     { throw "UNI.Hud.Widget.exe not found at $EXE -- publish it first (dotnet publish ... -o publish\widget)" }

# 2026-07-18 FIX: hud_widget_open.vbs uses WScript.ScriptFullName to derive
# `<script dir>\publish\widget\UNI.Hud.Widget.exe` — that works when it lives in
# viewer\hud\native\ but BREAKS when copied to Startup (it then looks for
# <Startup>\publish\widget\... which does not exist -> Windows Script Host error at
# every logon, code 80070002). Caught LIVE 2026-07-18 right before a broadcast
# reboot. Write an ABSOLUTE-path Startup .vbs instead of copying the relative one.
$vbsBody = @"
' UNI-HUD-Widget Startup launcher (installed by hud_widget_boot_install.ps1).
' Absolute path so the Startup folder location has no bearing on resolution.
' The widget is single-instance-guarded (named mutex UNI-HUD-Widget) so a
' duplicate logon-launch is a safe no-op.
Set sh = CreateObject("WScript.Shell")
sh.Run """$EXE""", 0, False
"@
Set-Content -Path $LNK -Value $vbsBody -Encoding ASCII -Force

if (-not (Test-Path $LNK)) { throw "install FAILED: launcher not present at $LNK" }
"Installed logon launcher: $LNK"
"Target exe: $EXE"
"Signed: $((Get-AuthenticodeSignature $EXE).Status)"
"After the next logon: the HUD widget opens on its own, docked to the right edge."
"Single-instance guarded (named mutex) -- a duplicate logon-launch is a safe no-op."
