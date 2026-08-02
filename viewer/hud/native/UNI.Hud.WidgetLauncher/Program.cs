// UNI.Hud.WidgetLauncher — real Windows Service (ServiceBase via
// Microsoft.Extensions.Hosting.WindowsServices). NOT NSSM-wrapped, not a script.
// Registered with the SCM as SERVICE_NAME=UNI-HUD-WidgetLauncher, START_TYPE=AUTO_START,
// SERVICE_START_NAME=LocalSystem (needed to register/trigger a task for the logged-on user).
//
// WHY THIS EXISTS: Windows Session 0 isolation forbids a Windows Service from drawing a
// window in the operator's session — services run in Session 0, the operator logs into
// Session 1+, and any window a Session 0 process tries to create appears in an invisible
// desktop. So the WIDGET (UNI.Hud.Widget.exe, WPF) cannot itself be a Windows Service.
// The correct, non-fragile pattern is: a Windows Service supervisor that delegates the
// spawn to the Windows Task Scheduler service (which owns the session/window-station/
// desktop plumbing) rather than hand-rolling CreateProcessAsUser + desktop DACL surgery
// (that path died with 0xC0000142 and breaks on RDP / fast-user-switch / updates).
//
// So this service registers a native Scheduled Task "UNI\HUD Widget" (interactive-token,
// at-logon) and triggers it whenever the widget is absent. There is NO .vbs and NO .ps1
// anywhere in the boot path. The whole chain is compiled/native:
//   SCM.exe (Windows) -> UNI.Hud.WidgetLauncher.exe (this) -> Task Scheduler service
//                     -> UNI.Hud.Widget.exe (WPF, in the operator's session).

using UNI.Hud.WidgetLauncher;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "UNI-HUD-WidgetLauncher");
builder.Services.AddHostedService<LauncherWorker>();

var host = builder.Build();
await host.RunAsync();
