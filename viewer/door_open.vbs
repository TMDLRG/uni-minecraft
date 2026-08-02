' door_open.vbs - flash-free wrapper for the desktop/taskbar icon (installed by door_boot_install.ps1
' shortcuts or by the agent). Runs door_open.ps1 hidden: ensure watchdog -> ensure launcher -> open door.
' Path-portable: derives the repo location from its own position (viewer\).
Set fso = CreateObject("Scripting.FileSystemObject")
v = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & q & v & "\door_open.ps1" & q, 0, False
