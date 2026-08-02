using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Application = System.Windows.Application;
using StartupEventArgs = System.Windows.StartupEventArgs;
using ExitEventArgs = System.Windows.ExitEventArgs;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using DispatcherUnhandledExceptionEventArgs = System.Windows.Threading.DispatcherUnhandledExceptionEventArgs;

namespace UNI.Hud.Widget;

public partial class App : Application
{
    private static Mutex? _mutex;
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "UNI-HUD", "widget-crash.log");

    protected override void OnStartup(StartupEventArgs e)
    {
        // Single-instance guard (named mutex; the widget must not run twice)
        _mutex = new Mutex(true, "UNI-HUD-Widget", out var isNew);
        if (!isNew)
        {
            MessageBox.Show("UNI HUD is already running.", "UNI HUD",
                MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }

        // Global unhandled-exception handlers. Without these, a single throw anywhere in
        // the poll/render path (UI thread) or a background Task (HttpClient callbacks,
        // DispatcherTimer ticks) kills the entire process with zero diagnostic trail --
        // the operator just sees the widget vanish with no explanation. Log first, THEN
        // let WPF's default unhandled-exception dialog show (do not set e.Handled=true --
        // an unknown exception means unknown state; recovering silently could paper over
        // a real bug and leave the operator staring at a widget quietly showing stale or
        // wrong data forever).
        Current.DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnAppDomainUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        base.OnStartup(e);
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        LogCrash("DispatcherUnhandledException (UI thread)", e.Exception);
        // Leave e.Handled = false: let WPF's default crash behavior proceed after logging.
    }

    private void OnAppDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        LogCrash("AppDomain.UnhandledException", e.ExceptionObject as Exception);
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        LogCrash("TaskScheduler.UnobservedTaskException", e.Exception);
        e.SetObserved(); // background task exceptions don't need to crash the process
    }

    private static void LogCrash(string source, Exception? ex)
    {
        try
        {
            var dir = Path.GetDirectoryName(LogPath)!;
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            var text = $"[{DateTime.UtcNow:O}] {source}\n{ex}\n\n";
            File.AppendAllText(LogPath, text);
        }
        catch { /* logging must never itself throw during a crash handler */ }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try { _mutex?.ReleaseMutex(); _mutex?.Dispose(); } catch { }
        base.OnExit(e);
    }
}
