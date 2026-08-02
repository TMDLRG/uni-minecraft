using System;
using System.Collections.Generic;
using System.Linq;

namespace UNI.Hud.Widget;

// THE ONE CHANGE (gate air-alarm-annunciates, 2026-07-17). The pure, testable core of the off-monitor
// air alarm — the walk-away leg the studio never had. Nothing here touches WPF or Win32; the widget
// feeds it facts + a clock and annunciates whatever it returns (sound + balloon + flash).
//
// THE LAW THIS ENCODES:
//   * ARM only on a fresh, MEASURED streaming==true. DISARM only on a fresh streaming==false. NEVER
//     disarm on UNKNOWN/stale — an alarm that goes quiet because it lost sight of the truth is
//     fail-OPEN. That is why BLIND is itself a firing code: losing the snapshot while armed is an
//     alarm condition, not a reason to stand down.
//   * Silent unless ARMED, i.e. silent unless we are MEASURABLY on the air. The 12h idle uptime and
//     every G-PA ARM-before-CONFIRM window (readers=0, pushers flapping by design) are silent because
//     `streaming` is false in them.
//   * Each code names a MEASURED fact and is dwell/gate-guarded so a blip is not a siren.
//   * ANNUNCIATE ONLY. This engine never cuts, never disarms fan-out, never touches G-PA.
public enum AlarmCode { EgressCollapse, KeyRejected, Blind }

public sealed class AlarmFacts
{
    public bool StreamingFresh;     // air.streaming == true AND air not stale
    public bool StreamingKnownOff;  // air fresh AND streaming == false (a MEASURED off, not "unknown")
    public long? Readers;           // egress.readers — null = NOT MEASURED (must never fire EgressCollapse)
    public bool KeyRejectedRow;     // a fanout.* health row ok:false on the D5 uniReady branch ONLY
    public bool Blind;              // snapshot stale (poll loop stalled) or the snapshot GET failed
}

public sealed class AlarmDecision
{
    public bool Armed;
    public HashSet<AlarmCode> Firing = new();
    public bool PlaySound;          // true if any firing code is NOT currently ack-silenced
    public string Summary = "";
}

public sealed class AlarmEngine
{
    public const long EGRESS_DWELL_MS = 30_000;   // covers the 3s respawn cycle + CONFIRM->readers gap
    public const long ACK_SILENCE_MS = 600_000;   // ACK silences a code's SOUND for 10 min (never the badge)

    private bool _armed;
    private readonly Dictionary<AlarmCode, long> _condSince = new();  // when a code's condition first went true (dwell)
    private readonly Dictionary<AlarmCode, long> _ackUntil = new();   // sound silenced until this ms

    public bool Armed => _armed;

    public AlarmDecision Update(AlarmFacts f, long nowMs)
    {
        // --- LATCH ---------------------------------------------------------------------------------
        if (f.StreamingFresh) _armed = true;
        else if (f.StreamingKnownOff) { _armed = false; _condSince.Clear(); _ackUntil.Clear(); }
        // else (UNKNOWN / stale): leave the latch as-is. Never disarm on lost sight.

        var d = new AlarmDecision { Armed = _armed };
        if (!_armed) return d;

        // --- raw conditions (each a measured fact; only meaningful while armed) --------------------
        bool egress = f.StreamingFresh && f.Readers.HasValue && f.Readers.Value == 0;
        bool key = f.KeyRejectedRow;   // the health row is itself uniReady-gated + flap-windowed (D5/D8)
        bool blind = f.Blind;          // itself gated: "older than 3x the measured interval"

        // --- dwell (only EgressCollapse needs an extra hold; key/blind are pre-gated upstream) -----
        UpdateDwell(AlarmCode.EgressCollapse, egress, nowMs);
        UpdateDwell(AlarmCode.KeyRejected, key, nowMs);
        UpdateDwell(AlarmCode.Blind, blind, nowMs);

        if (egress && DwellElapsed(AlarmCode.EgressCollapse, nowMs, EGRESS_DWELL_MS)) d.Firing.Add(AlarmCode.EgressCollapse);
        if (key) d.Firing.Add(AlarmCode.KeyRejected);
        if (blind) d.Firing.Add(AlarmCode.Blind);

        // sound plays if ANY firing code is not currently ack-silenced
        d.PlaySound = d.Firing.Any(c => !_ackUntil.TryGetValue(c, out var until) || nowMs >= until);
        d.Summary = d.Firing.Count == 0 ? "on air — all measured signals nominal"
            : string.Join(" · ", d.Firing.Select(Describe));
        return d;
    }

    // ACK one firing code: silence its SOUND for 10 min. Never clears the badge, never disarms, and
    // refuses to ack a code that is not currently firing (returns false).
    public bool Ack(AlarmCode code, long nowMs, AlarmDecision current)
    {
        if (current == null || !current.Firing.Contains(code)) return false;
        _ackUntil[code] = nowMs + ACK_SILENCE_MS;
        return true;
    }

    public long AckRemainingMs(AlarmCode code, long nowMs)
        => _ackUntil.TryGetValue(code, out var until) && until > nowMs ? until - nowMs : 0;

    private void UpdateDwell(AlarmCode code, bool condTrue, long nowMs)
    {
        if (condTrue) { if (!_condSince.ContainsKey(code)) _condSince[code] = nowMs; }
        else _condSince.Remove(code);
    }
    private bool DwellElapsed(AlarmCode code, long nowMs, long dwellMs)
        => _condSince.TryGetValue(code, out var since) && nowMs - since >= dwellMs;

    public static string Describe(AlarmCode c) => c switch
    {
        AlarmCode.EgressCollapse => "EGRESS COLLAPSE — live, but NOBODY is pulling the program",
        AlarmCode.KeyRejected    => "KEY REJECTED — the ingest is publishing but a platform is dropping it",
        AlarmCode.Blind          => "BLIND — the HUD lost the snapshot while on the air",
        _ => c.ToString(),
    };
}
