using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.TaskScheduler;
// Both namespaces define a `Task`. Bare `Task` -> the async one; the scheduler's is `TSTask`.
using Task = System.Threading.Tasks.Task;
using TSTask = Microsoft.Win32.TaskScheduler.Task;

namespace UNI.Hud.WidgetLauncher;

// The service worker. Every 5 seconds it does two things:
//   1. ENSURE the native Windows Scheduled Task "UNI\HUD Widget" exists and is current
//      (idempotent; re-registers only if missing or drifted).
//   2. If a user is logged on AND UNI.Hud.Widget.exe is NOT already running in that
//      session, TRIGGER the task (task.Run()) so the Task Scheduler service spawns the
//      widget into the operator's session.
//
// WHY TASK SCHEDULER INSTEAD OF CreateProcessAsUser (the change on 2026-07-18):
//   The prior version hand-rolled WTSQueryUserToken -> DuplicateTokenEx ->
//   CreateProcessAsUser(lpDesktop "winsta0\default"). The child spawned then died within
//   ~2s with 0xC0000142 (STATUS_DLL_INIT_FAILED): a Session-0 service that spawns a UI
//   process into the interactive desktop must first grant the interactive window-station
//   and desktop DACLs to the duplicated token (AddAceToWindowStation/AddAceToDesktop).
//   That hand-rolled DACL surgery is the brittle part — it breaks on RDP reconnect, fast
//   user switching, and Windows updates. The Windows Task Scheduler service already owns
//   the session/window-station/desktop plumbing correctly, which is exactly why launching
//   a UI process through it CANNOT produce 0xC0000142. So we keep this compiled Windows
//   service as the supervisor, and delegate the actual spawn to Task Scheduler.
//
// The boot path stays 100% compiled/native, no script anywhere:
//   SCM.exe (Windows) -> UNI.Hud.WidgetLauncher.exe (this) -> Task Scheduler service
//                     -> UNI.Hud.Widget.exe (WPF, in the operator's session).
//
// Two independent legs, defence in depth:
//   * FAST active supervision (5s): this service triggers the task the moment the widget
//     is missing — covers a mid-broadcast widget crash quickly (the air alarm lives there).
//   * OS-NATIVE fallback: the task carries its own At-Log-On trigger + restart-on-failure,
//     so the widget comes up at every logon and after a crash even if this service is down.
//
// SAFETY:
//   * The widget is single-instance-guarded (named mutex UNI-HUD-Widget in App.xaml.cs),
//     so a race between "is it running?" and the spawn is a no-op — the extra instance sees
//     the mutex and exits immediately. That also makes the task's own trigger and our
//     task.Run() safe to both fire.
//   * We never trigger anything if nobody is logged on (WTSGetActiveConsoleSessionId).
public sealed class LauncherWorker : BackgroundService
{
    private const string WIDGET_PROCESS_NAME = "UNI.Hud.Widget";
    private const string TASK_FOLDER = "UNI";
    private const string TASK_NAME = "HUD Widget";
    private const string TASK_PATH = @"UNI\HUD Widget";

    // publish\widget_launcher\UNI.Hud.WidgetLauncher.exe -> ..\widget\UNI.Hud.Widget.exe
    private static readonly string WIDGET_EXE = Path.GetFullPath(Path.Combine(
        AppContext.BaseDirectory, "..", "widget", "UNI.Hud.Widget.exe"));
    private static readonly string WIDGET_DIR = Path.GetDirectoryName(WIDGET_EXE) ?? "";

    private readonly ILogger<LauncherWorker> _log;

    // Direct file log — the ILogger EventLog provider isn't wired on hosted services by
    // default, so LogInformation goes nowhere visible. This file is the SOURCE OF TRUTH for
    // what the tick loop is doing. UTF8, appended, safe to tail while the service runs.
    private static readonly string LOG_FILE = @"C:\Users\mpolz\Documents\UNI.Minecraft\logs\widget_launcher_service.log";

    // Signature of the last successfully-registered task ("user|exe") so we don't re-register
    // every 5s tick — only when the task is missing or the operator/exe path drifts.
    private string _ensuredSignature = "";

    private static void FileLog(string msg)
    {
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(LOG_FILE)!);
            File.AppendAllText(LOG_FILE, $"[{DateTime.UtcNow:O}] {msg}{Environment.NewLine}");
        } catch { /* logging must not crash the service */ }
    }

    public LauncherWorker(ILogger<LauncherWorker> log) { _log = log; }

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        FileLog($"START pid={Environment.ProcessId} user={Environment.UserName} widget_target={WIDGET_EXE} exists={File.Exists(WIDGET_EXE)}");
        _log.LogInformation("UNI.Hud.WidgetLauncher started. Widget target: {exe}", WIDGET_EXE);
        while (!stop.IsCancellationRequested)
        {
            try { TickOnce(); }
            catch (Exception ex) { FileLog($"TICK FAULT: {ex}"); _log.LogError(ex, "tick failed"); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stop); } catch (OperationCanceledException) { }
        }
        FileLog("STOP requested");
    }

    private void TickOnce()
    {
        uint sessionId = WTSGetActiveConsoleSessionId();
        if (sessionId == 0xFFFFFFFF) { FileLog("tick: no active console session; skip"); return; }

        string user = GetSessionUser(sessionId);
        if (string.IsNullOrWhiteSpace(user)) { FileLog($"tick: session {sessionId} has no logged-on user yet; skip"); return; }

        // 1) Ensure the scheduled task is registered and current (idempotent).
        EnsureTask(user);

        // 2) If the widget is already up in that session, nothing to do.
        if (IsWidgetRunningInSession(sessionId)) return;

        if (!File.Exists(WIDGET_EXE))
        {
            FileLog($"tick: widget exe not found at {WIDGET_EXE}; cannot trigger");
            _log.LogWarning("widget exe not found at {exe}", WIDGET_EXE);
            return;
        }

        // 3) Trigger the task. Task Scheduler spawns the widget in the user's session with
        //    the correct window-station/desktop — no CreateProcessAsUser, no 0xC0000142.
        try
        {
            using var ts = new TaskService();
            TSTask task = ts.GetTask(TASK_PATH);
            if (task == null)
            {
                FileLog($"tick: task {TASK_PATH} missing after EnsureTask; will re-ensure next tick");
                _ensuredSignature = "";
                return;
            }
            FileLog($"tick: widget absent in session {sessionId} -> task.Run()");
            task.Run();
            FileLog("  task.Run() issued (Task Scheduler will spawn the widget in-session)");
            _log.LogInformation("triggered {task} to spawn widget in session {sid}", TASK_PATH, sessionId);
        }
        catch (Exception ex)
        {
            FileLog($"tick: task.Run() FAILED: {ex.Message}");
            _log.LogWarning(ex, "task.Run() failed");
        }
    }

    // Register (or update) the native Windows Scheduled Task that launches the widget.
    // Runs as the logged-on operator via an INTERACTIVE TOKEN — no password is ever stored.
    // Idempotent: only touches the Task Scheduler when the task is missing or the signature
    // (operator account + widget exe path) has changed since the last registration.
    private void EnsureTask(string user)
    {
        string signature = $"{user}|{WIDGET_EXE}";
        try
        {
            using var ts = new TaskService();
            TSTask existing = ts.GetTask(TASK_PATH);
            if (existing != null && _ensuredSignature == signature) return; // already current this run

            TaskDefinition td = ts.NewTask();
            td.RegistrationInfo.Author = "UNI HUD";
            td.RegistrationInfo.Description =
                "Launches the UNI HUD glance widget (UNI.Hud.Widget.exe) in the operator's session. " +
                "Registered and triggered by the UNI-HUD-WidgetLauncher Windows service; also self-fires " +
                "at logon. Session 0 isolation forbids the service from drawing UI, so the widget runs here " +
                "as the logged-on user via an interactive token (no stored password).";

            // Run as the logged-on user, interactive token (NO password), normal (Limited) rights.
            td.Principal.LogonType = TaskLogonType.InteractiveToken;
            td.Principal.UserId = user;
            td.Principal.RunLevel = TaskRunLevel.LUA;

            // Leg 2 (OS-native fallback): fire at this operator's logon.
            td.Triggers.Add(new LogonTrigger { UserId = user });

            // The action: launch the widget exe directly. No .vbs, no .ps1, no wrapper.
            td.Actions.Add(new ExecAction(WIDGET_EXE, null, WIDGET_DIR));

            // Supervision + hygiene.
            td.Settings.MultipleInstances = TaskInstancesPolicy.IgnoreNew; // belt-and-suspenders with the mutex
            td.Settings.RestartCount = 3;
            td.Settings.RestartInterval = TimeSpan.FromMinutes(1); // Task Scheduler minimum
            td.Settings.ExecutionTimeLimit = TimeSpan.Zero;        // never auto-kill the UI
            td.Settings.DisallowStartIfOnBatteries = false;
            td.Settings.StopIfGoingOnBatteries = false;
            td.Settings.AllowDemandStart = true;                   // this service triggers it on demand
            td.Settings.StartWhenAvailable = true;
            td.Settings.Enabled = true;
            td.Settings.Hidden = false;

            // Ensure the UNI folder exists, then register (create or update).
            TaskFolder root = ts.RootFolder;
            TaskFolder folder;
            try { folder = root.SubFolders[TASK_FOLDER]; }
            catch { folder = root.CreateFolder(TASK_FOLDER, null!, false); }

            folder.RegisterTaskDefinition(TASK_NAME, td, TaskCreation.CreateOrUpdate,
                user, null, TaskLogonType.InteractiveToken);

            _ensuredSignature = signature;
            FileLog($"EnsureTask: registered/updated {TASK_PATH} for user={user} action={WIDGET_EXE}");
            _log.LogInformation("ensured scheduled task {task} for {user}", TASK_PATH, user);
        }
        catch (Exception ex)
        {
            _ensuredSignature = "";
            FileLog($"EnsureTask FAILED for user={user}: {ex.Message}");
            _log.LogWarning(ex, "EnsureTask failed for {user}", user);
        }
    }

    private static bool IsWidgetRunningInSession(uint sessionId)
    {
        foreach (var p in Process.GetProcessesByName(WIDGET_PROCESS_NAME))
        {
            try { if ((uint)p.SessionId == sessionId) return true; }
            catch { /* process may have exited between enumeration and query */ }
        }
        return false;
    }

    // Resolve "DOMAIN\user" for the given session via WTSQuerySessionInformation.
    // Read-only, non-fragile: this only reads the username so we can name the task's
    // principal; it never manipulates tokens or desktops. Returns "" if nobody is logged on.
    private static string GetSessionUser(uint sessionId)
    {
        string user = QuerySessionString(sessionId, WTS_INFO_CLASS.WTSUserName);
        if (string.IsNullOrWhiteSpace(user)) return "";
        string domain = QuerySessionString(sessionId, WTS_INFO_CLASS.WTSDomainName);
        return string.IsNullOrWhiteSpace(domain) ? user : $"{domain}\\{user}";
    }

    private static string QuerySessionString(uint sessionId, WTS_INFO_CLASS infoClass)
    {
        IntPtr buffer = IntPtr.Zero;
        try
        {
            if (WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out buffer, out uint bytes)
                && buffer != IntPtr.Zero && bytes > 0)
            {
                return (Marshal.PtrToStringUni(buffer) ?? "").Trim();
            }
            return "";
        }
        catch { return ""; }
        finally { if (buffer != IntPtr.Zero) WTSFreeMemory(buffer); }
    }

    // ---- Win32 P/Invoke (read-only session identity only — no token/desktop manipulation) ----
    private enum WTS_INFO_CLASS { WTSUserName = 5, WTSDomainName = 7 }

    [DllImport("kernel32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr hServer, uint sessionId, WTS_INFO_CLASS wtsInfoClass, out IntPtr ppBuffer, out uint pBytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr pMemory);
}
