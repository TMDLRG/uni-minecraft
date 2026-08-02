// Enlightened.cs — service-context sight detectors.
// User-scoped detectors (OBS crash sentinel, etc.) live in the user-mode helper
// and reach the service via POST /api/hud/sight/push. Do not add user-profile
// probes here — service runs as LocalSystem, some user paths are invisible.

using System.Text.Json;
using System.Text.RegularExpressions;

namespace UNI.Hud.Service;

public static class Enlightened
{
    public static SightEnvelope Gather(Dictionary<string, object?> snapshot, HudState state)
    {
        var findings = new List<SightFinding>();
        var now = DateTime.UtcNow;
        var sinceMap = state.SightSince;

        SightFinding Mark(string code, string severity, string title, string detail, string source)
        {
            if (!sinceMap.TryGetValue(code, out var first)) { sinceMap[code] = now; first = now; }
            return new SightFinding(code, severity, title, detail, source, (long)(now - first).TotalMilliseconds);
        }

        // Studio-port + door contradictions
        if (snapshot["studio_ports"] is Dictionary<string, object?> ports)
        {
            foreach (var (key, val) in ports)
            {
                if (val is null) continue;
                var t = val as dynamic; string? detail = t?.detail; bool? up = t?.up;
                if (up == true && detail != null && Regex.IsMatch(detail, "down|UNREACHABLE|failed|not reachable|refused", RegexOptions.IgnoreCase))
                    findings.Add(Mark($"tile-lies-up-{key}", "bad",
                        $"Tile '{key}' claims UP but its detail says otherwise",
                        $"up=true, detail=\"{detail}\"",
                        "launcher /api/mission tile"));
            }
        }

        if (snapshot["door_open"] is Dictionary<string, object?> doors)
        {
            foreach (var (key, val) in doors)
            {
                if (val is null) continue;
                // HONESTY FIX (2026-07-16): was `?? true` — an unreadable/missing circle_ok silently
                // claimed ok. Fail closed: unknown counts as NOT ok, so a broken door is never masked.
                var d = val as dynamic; bool circleOk = d?.circle_ok ?? false;
                if (!circleOk)
                    findings.Add(Mark($"door-circle-broken-{key}", "bad",
                        $"door '{key}' circle BROKEN",
                        (string?)(d?.prediction) ?? "(no prediction)",
                        "door /api/door/state"));
            }
        }

        // Poll loop stall
        var pollMs = 3000;
        if (state.LastPollAt.HasValue && (now - state.LastPollAt.Value).TotalMilliseconds > 3 * pollMs)
            findings.Add(Mark("poll-loop-stalled", "bad",
                $"HUD poll loop stalled — last poll {(int)(now - state.LastPollAt.Value).TotalSeconds}s ago",
                "poll data is stale; upstreams may be blocked or the process is hung",
                "hudState.last_poll_at"));

        // Upstream unreachable — info-level truth share
        if (snapshot["upstreams"] is IDictionary<string, object?> ups)
        {
            foreach (var (name, val) in ups)
            {
                if (val is null) continue;
                var u = val as dynamic; bool? upv = u?.up;
                if (upv == null)
                    findings.Add(Mark($"upstream-unreachable-{name}", "info",
                        $"upstream '{name}' unreachable",
                        (string?)(u?.err) ?? "no error",
                        (string?)(u?.url) ?? name));
            }
        }

        // Drop stale sinceMap entries
        var active = findings.Select(f => f.code).ToHashSet();
        foreach (var k in sinceMap.Keys.ToList()) if (!active.Contains(k)) sinceMap.Remove(k);

        return new SightEnvelope(
            updated_at: now.ToString("O"),
            total: findings.Count,
            counts: new SightCounts(
                bad: findings.Count(f => f.severity == "bad"),
                warn: findings.Count(f => f.severity == "warn"),
                info: findings.Count(f => f.severity == "info")),
            findings: findings,
            user_sight: null);
    }
}
