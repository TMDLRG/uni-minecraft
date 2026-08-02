using System;
using System.Collections.Generic;

namespace UNI.Hud.Widget;

// Pure render-DECISION logic, extracted from MainWindow so it is unit-testable WITHOUT WPF
// (gate hud-renderer-honesty, 2026-07-17). The widget still owns the pixels — it sets
// `TextBlock.Text = d.Text` and `.Foreground = FindResource(d.Brush)`. These functions own the
// HONESTY: what colour a value has earned, when a stale value must grey, when a blind sensor must
// NOT read green. Every WS-B render fix routes through here so a test can rehearse its failure.
//
// Brush keys are the resource keys defined in MainWindow.xaml: Ok(green) Bad(red) Warn(amber)
// Nv/Dim/Mute(greys). Returning the KEY (not a Brush) keeps this file free of WPF.
public static class RenderDecisions
{
    public enum Freshness { Missing, Fresh, Stale }

    // B5 (hud-freshness-honest): a value that EXISTS but is many polls old is STALE, not current.
    // slotsBack = measured intervals since the last real sample. >2 => stale (grey + state the age).
    public static Freshness MetricFreshness(bool hasValue, int slotsBack)
        => !hasValue ? Freshness.Missing : slotsBack > 2 ? Freshness.Stale : Freshness.Fresh;

    // The air badge. STREAMING_DARK is a LIVE black push — red, NEVER the reassuring green the old
    // "STREAMING" level used. UNKNOWN/stale/empty => SYNCING (we never fabricate OFF).
    public static (string Text, string Brush) AirBadge(string? level, bool stale)
    {
        if (stale || level == "UNKNOWN" || string.IsNullOrEmpty(level)) return ("SYNCING", "Nv");
        return level switch
        {
            "LIVE_LIVE"      => ("● LIVE", "Bad"),
            "STREAMING_DARK" => ("● LIVE — NO PICTURE", "Bad"),
            "REHEARSAL"      => ("REHEARSAL", "Warn"),
            "OFF"            => ("OFF AIR", "Dim"),
            _                => (level!, "Dim"),
        };
    }

    // B2 (egress-armed-floor-always-on): the egress tile is green ONLY if every ARMED pusher is
    // holding a reader — readers >= max(1, armed). One reader among two armed is a PARTIAL (amber),
    // never green. null readers = not measured (grey), never a confident 0.
    public static (string Brush, bool Green) EgressColour(long? readers, long armed)
    {
        if (!readers.HasValue) return ("Nv", false);
        var want = Math.Max(1, armed);
        if (readers.Value >= want) return ("Ok", true);
        if (readers.Value >= 1) return ("Warn", false);
        return ("Mute", false);
    }

    // B6 (hud-sight-shows-blind): a blind user-sight sensor must NOT read green/"resonant". The dead
    // helper's findings drop out, so a green SIGHT gets greener as the sensor dies — this forces the
    // blindness onto the surface as a Warn without inventing a `bad` finding for never-reported.
    public static (string Text, string Brush) SightHeader(int total, int bad, int warn, int info, bool userSightFresh)
    {
        var blind = !userSightFresh;
        string text = blind
            ? (total == 0
                ? "SIGHT — user detectors NOT REPORTING (0 service findings)"
                : $"SIGHT — {total} findings ({bad} bad · {warn} warn · {info} info) · user detectors NOT REPORTING")
            : (total == 0
                ? "SIGHT — 0 findings · resonant"
                : $"SIGHT — {total} findings ({bad} bad · {warn} warn · {info} info)");
        string brush = bad > 0 ? "Bad" : (warn > 0 || blind) ? "Warn" : info > 0 ? "Dim" : "Ok";
        return (text, brush);
    }

    // The colony liveness verdict: FROZEN only after a wall-clock DWELL since the counter last moved,
    // never a single aliased Δ of 0 (the false alarm found live on 2026-07-17). null = not measured.
    public static (string State, string Brush) ColonyLiveness(long? stalledMs, long dwellMs)
    {
        if (!stalledMs.HasValue) return ("not measured", "Nv");
        return stalledMs.Value >= dwellMs ? ("frozen", "Bad") : ("advancing", "Ok");
    }
}

// B7 (hud-recovery-repaints): the jitter-skip cache. A section that goes NOT-MEASURED must Invalidate
// its cached hash, so a recovery whose bytes are IDENTICAL to the pre-outage state repaints instead of
// early-returning on an unchanged hash (which pinned the "not measured" panel forever).
public sealed class SectionCache
{
    private readonly Dictionary<string, int> _h = new();

    // Returns true (and records the hash) when `data` differs from what was last painted for `section`.
    public bool ShouldRepaint(string section, string data)
    {
        var hash = data.GetHashCode();
        if (_h.TryGetValue(section, out var prev) && prev == hash) return false;
        _h[section] = hash;
        return true;
    }

    // Drop the cached hash — call on the not-measured path so the next real data always repaints.
    public void Invalidate(string section) => _h.Remove(section);
}
