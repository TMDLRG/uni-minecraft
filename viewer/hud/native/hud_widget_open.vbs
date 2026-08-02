' hud_widget_open.vbs - MANUAL cold-open ONLY (desktop-icon click). NOT the boot path.
'
' The HUD widget's boot/logon launch is the compiled UNI-HUD-WidgetLauncher Windows service,
' which registers + triggers the native Scheduled Task "UNI\HUD Widget" (see
' UNI.Hud.WidgetLauncher + _install_widget_launcher_elevated.ps1). This .vbs is only a
' convenience for opening the widget by hand from cold; it is NEVER copied into the Startup
' folder (that path was retired 2026-07-18). The widget is single-instance-guarded, so
' clicking this while the service already has it up is a safe no-op.
'
' Runs UNI.Hud.Widget.exe (the WPF window itself is what shows; this just avoids a console
' flash). Path-portable: derives from its own location.
Set fso = CreateObject("Scripting.FileSystemObject")
v = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run q & v & "\publish\widget\UNI.Hud.Widget.exe" & q, 0, False
