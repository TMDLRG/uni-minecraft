// EventLogger.cs — Windows Application Event Log writer.
// Writes to source "UNI-HUD" (created at install time by the elevated
// installer; falls back to "Application" if the source doesn't exist yet).

using System.Diagnostics;

namespace UNI.Hud.Service;

public sealed class EventLogger
{
    private const string PreferredSource = "UNI-HUD";
    private const string FallbackSource = "Application";
    private readonly string _source;
    private readonly Dictionary<string, DateTime> _lastWrite = new();
    private static readonly TimeSpan RateLimit = TimeSpan.FromSeconds(1);
    private readonly Lock _lock = new();

    // Event IDs — stable across versions for filter compatibility.
    public const int EvtServiceStart      = 1000;
    public const int EvtServiceStop       = 1001;
    public const int EvtUpstreamDegraded  = 1002;
    public const int EvtUpstreamRecovered = 1003;
    public const int EvtSightBad          = 2000;
    public const int EvtSightWarn         = 2001;
    public const int EvtAudienceRejected  = 3000;
    public const int EvtServerCrash       = 9000;

    public EventLogger()
    {
        _source = EventLog.SourceExists(PreferredSource) ? PreferredSource : FallbackSource;
    }

    public void Info(int eventId, string message)  => Write(eventId, EventLogEntryType.Information, message);
    public void Warn(int eventId, string message)  => Write(eventId, EventLogEntryType.Warning, message);
    public void Error(int eventId, string message) => Write(eventId, EventLogEntryType.Error, message);

    private void Write(int eventId, EventLogEntryType type, string message)
    {
        lock (_lock)
        {
            var key = $"{_source}:{eventId}";
            if (_lastWrite.TryGetValue(key, out var last) && DateTime.UtcNow - last < RateLimit) return;
            _lastWrite[key] = DateTime.UtcNow;
        }
        try
        {
            EventLog.WriteEntry(_source, message.Length > 30000 ? message[..30000] : message, type, eventId);
        }
        catch { /* fire-and-forget — never let logging kill the service */ }
    }
}
