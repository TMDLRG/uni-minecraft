// RenderDecisionsTests.cs — the HUD WIDGET's render honesty, as tests (gate hud-renderer-honesty).
//
// Until now the whole HUD suite covered the SERVICE; the widget renderer — where every WS-B render fix
// lives — had ZERO tests, so the receipts' standing rule forbade any green claim about it. These pin
// the pure decisions the widget calls (RenderDecisions.cs), each encoding the exact failure it exists
// to catch: a stale value rendered green, a black push rendered green, a blind sensor rendered
// "resonant", a stale panel pinned after recovery.

using UNI.Hud.Widget;

namespace UNI.Hud.Widget.Tests;

public class AirBadgeTests
{
    [Fact] // blocker #1: STREAMING_DARK is a LIVE black push — it must be RED, never the old green.
    public void StreamingDark_IsRed_NeverGreen()
    {
        var (text, brush) = RenderDecisions.AirBadge("STREAMING_DARK", stale: false);
        Assert.Equal("Bad", brush);                 // red
        Assert.NotEqual("Ok", brush);               // never the reassuring green
        Assert.Contains("NO PICTURE", text);
    }

    [Fact] // LIVE with a picture is the tally red — correct and unchanged.
    public void LiveLive_IsTallyRed()
    {
        var (text, brush) = RenderDecisions.AirBadge("LIVE_LIVE", stale: false);
        Assert.Equal("Bad", brush);
        Assert.Equal("● LIVE", text);
    }

    [Theory] // stale, UNKNOWN, empty, or null all read SYNCING — we NEVER fabricate a confident OFF.
    [InlineData("OFF", true)]
    [InlineData("UNKNOWN", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void UnknownOrStale_IsSyncing_NeverConfidentOff(string? level, bool stale)
    {
        var (text, brush) = RenderDecisions.AirBadge(level, stale);
        Assert.Equal("SYNCING", text);
        Assert.Equal("Nv", brush);
    }

    [Fact] // a REAL off is still allowed to say OFF (grey), honesty cuts both ways.
    public void RealOff_SaysOffAir()
    {
        var (text, brush) = RenderDecisions.AirBadge("OFF", stale: false);
        Assert.Equal("OFF AIR", text);
        Assert.Equal("Dim", brush);
    }
}

public class EgressFloorTests
{
    [Fact] // the defect: 1 reader among 2 armed must NOT be green (a platform is dark).
    public void OneOfTwoArmed_IsNotGreen()
    {
        var (brush, green) = RenderDecisions.EgressColour(readers: 1, armed: 2);
        Assert.False(green);
        Assert.Equal("Warn", brush);
    }

    [Fact] // every armed pusher delivering => green.
    public void AllArmedDelivering_IsGreen()
    {
        var (brush, green) = RenderDecisions.EgressColour(readers: 2, armed: 2);
        Assert.True(green);
        Assert.Equal("Ok", brush);
    }

    [Fact] // restream.ps1 path (armed 0): floor is max(1,0)=1 — 1 reader is green, 0 is not.
    public void RestreamPath_FloorsAtOne()
    {
        Assert.True(RenderDecisions.EgressColour(1, 0).Green);
        Assert.False(RenderDecisions.EgressColour(0, 0).Green);
    }

    [Fact] // null readers = NOT MEASURED, never a confident green or a confident 0.
    public void NullReaders_IsNotMeasured_NotGreen()
    {
        var (brush, green) = RenderDecisions.EgressColour(readers: null, armed: 2);
        Assert.False(green);
        Assert.Equal("Nv", brush);
    }
}

public class MetricFreshnessTests
{
    [Fact] // B5: a value 6 minutes (many slots) old is STALE, not a confident current number.
    public void OldValue_IsStale()
    {
        Assert.Equal(RenderDecisions.Freshness.Stale, RenderDecisions.MetricFreshness(hasValue: true, slotsBack: 120));
        Assert.Equal(RenderDecisions.Freshness.Stale, RenderDecisions.MetricFreshness(true, 3));
    }

    [Fact] // a value from the last poll or two is fresh.
    public void RecentValue_IsFresh()
    {
        Assert.Equal(RenderDecisions.Freshness.Fresh, RenderDecisions.MetricFreshness(true, 0));
        Assert.Equal(RenderDecisions.Freshness.Fresh, RenderDecisions.MetricFreshness(true, 2));
    }

    [Fact] // no value at all is Missing, not Stale (they render differently — "—" vs a greyed number).
    public void NoValue_IsMissing()
    {
        Assert.Equal(RenderDecisions.Freshness.Missing, RenderDecisions.MetricFreshness(false, -1));
    }
}

public class SightBlindTests
{
    [Fact] // B6: a blind user-sight sensor must read NOT REPORTING in Warn — never a greener "resonant".
    public void BlindSensor_ZeroFindings_NotReporting_NotGreen()
    {
        var (text, brush) = RenderDecisions.SightHeader(total: 0, bad: 0, warn: 0, info: 0, userSightFresh: false);
        Assert.Contains("NOT REPORTING", text);
        Assert.Equal("Warn", brush);
        Assert.NotEqual("Ok", brush);   // the exact regression: 0 findings + dead sensor must not be green
    }

    [Fact] // a fresh sensor with genuinely nothing wrong is allowed to read resonant (green).
    public void FreshSensor_ZeroFindings_IsResonantGreen()
    {
        var (text, brush) = RenderDecisions.SightHeader(0, 0, 0, 0, userSightFresh: true);
        Assert.Contains("resonant", text);
        Assert.Equal("Ok", brush);
    }

    [Fact] // a real bad finding is red regardless of the user-sight leg.
    public void BadFinding_IsRed()
    {
        Assert.Equal("Bad", RenderDecisions.SightHeader(1, 1, 0, 0, userSightFresh: true).Brush);
        Assert.Equal("Bad", RenderDecisions.SightHeader(1, 1, 0, 0, userSightFresh: false).Brush);
    }
}

public class ColonyLivenessTests
{
    private const long Dwell = 30000;

    [Fact] // the false alarm found live: an aliased small stall (2s) on a LIVE colony is NOT frozen.
    public void ShortStall_IsAdvancing_NotFrozen()
    {
        var (state, brush) = RenderDecisions.ColonyLiveness(stalledMs: 2000, Dwell);
        Assert.Equal("advancing", state);
        Assert.Equal("Ok", brush);
    }

    [Fact] // a genuinely stopped mind (past the dwell) is FROZEN/red.
    public void LongStall_IsFrozen()
    {
        var (state, brush) = RenderDecisions.ColonyLiveness(stalledMs: 45000, Dwell);
        Assert.Equal("frozen", state);
        Assert.Equal("Bad", brush);
    }

    [Fact] // never measured is not "advancing" and not "frozen".
    public void Unmeasured_IsNotMeasured()
    {
        var (state, brush) = RenderDecisions.ColonyLiveness(stalledMs: null, Dwell);
        Assert.Equal("not measured", state);
        Assert.Equal("Nv", brush);
    }
}

public class SectionCacheRecoveryTests
{
    [Fact] // B7: a section that goes not-measured must repaint on a byte-IDENTICAL recovery.
    public void NotMeasured_Then_IdenticalRecovery_Repaints()
    {
        var c = new SectionCache();
        Assert.True(c.ShouldRepaint("health", "GOOD"));   // first paint
        Assert.False(c.ShouldRepaint("health", "GOOD"));  // unchanged — skip (the jitter optimisation)

        // console goes unreachable → the render path Invalidates the cached hash
        c.Invalidate("health");

        // recovery with the SAME bytes as before the outage MUST repaint, not early-return.
        Assert.True(c.ShouldRepaint("health", "GOOD"));
    }

    [Fact] // without Invalidate, the identical recovery would be skipped — this proves the bug the fix kills.
    public void WithoutInvalidate_IdenticalRecovery_WouldBeSkipped()
    {
        var c = new SectionCache();
        c.ShouldRepaint("health", "GOOD");
        // (no Invalidate — simulating the OLD early-return-before-Clear path)
        Assert.False(c.ShouldRepaint("health", "GOOD"));   // pinned: the stale panel would stay forever
    }
}
