' hud_open.vbs - flash-free wrapper for the desktop/taskbar icon.
' Runs hud_open.ps1 hidden: ensure watchdog -> ensure server -> open HUD.
' Path-portable: derives the repo location from its own position (viewer\hud\).
Set fso = CreateObject("Scripting.FileSystemObject")
v = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & q & v & "\hud_open.ps1" & q, 0, False
