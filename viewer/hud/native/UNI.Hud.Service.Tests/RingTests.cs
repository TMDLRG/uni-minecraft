// RingTests.cs — the highest-risk untested logic per the ultracode review's
// tdd-coverage finding: the monotonic-timestamp guard that survives system
// clock jumps (NTP sync, DST, manual set). If this regresses, sparklines
// could silently show out-of-order data with no visible error anywhere.

using UNI.Hud.Service;
using Xunit;

namespace UNI.Hud.Service.Tests;

public class RingTests
{
    [Fact]
    public void Push_ThenAll_BasicOrder()
    {
        var r = new Ring(5);
        r.Push(1); r.Push(2); r.Push(3);
        Assert.Equal(3, r.Size);
        Assert.Equal(new double?[] { 1, 2, 3 }, r.Sparkline(3));
    }

    [Fact]
    public void Push_PastCap_WrapsAndEvictsOldest()
    {
        var r = new Ring(3);
        r.Push(1); r.Push(2); r.Push(3); r.Push(4);
        Assert.Equal(3, r.Size);
        Assert.Equal(new double?[] { 2, 3, 4 }, r.Sparkline(3));
    }

    [Fact]
    public void Push_WellPastCap_StillCorrectWindow()
    {
        var r = new Ring(3);
        for (int i = 0; i < 100; i++) r.Push(i);
        Assert.Equal(3, r.Size);
        Assert.Equal(new double?[] { 97, 98, 99 }, r.Sparkline(3));
    }

    [Fact]
    public void Sparkline_ReturnsExactlyNMostRecent()
    {
        var r = new Ring(10);
        for (int i = 0; i < 10; i++) r.Push(i);
        Assert.Equal(new double?[] { 7, 8, 9 }, r.Sparkline(3));
        Assert.Equal(10, r.Sparkline(10).Length);
        Assert.Empty(r.Sparkline(0));
        // requesting more than available caps at Size, never throws
        Assert.Equal(10, r.Sparkline(100).Length);
    }

    [Fact]
    public void Timestamps_MonotonicUnderClockReversal()
    {
        // Simulates an NTP sync / manual clock-set moving the clock BACKWARD
        // mid-stream. Every stored timestamp must still be strictly increasing,
        // otherwise a consumer sorting/rendering by timestamp could see
        // out-of-order or duplicate-looking data with zero visible error.
        var r = new Ring(5);
        var t0 = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        r.Push(1, t0);
        r.Push(2, t0); // same instant as previous -- must still advance
        r.Push(3, t0.AddSeconds(-10)); // clock jumped BACKWARD 10s -- must still advance

        // We can't read raw timestamps via the public API (by design), so we
        // verify indirectly: pushing 3 samples with non-increasing input
        // timestamps must not throw and must preserve insertion order in
        // Sparkline (which iterates the ring in physical/chronological slot
        // order, not by timestamp value) -- if the monotonic guard were
        // broken (e.g. `if (ts <= _lastTs)` became `if (ts < _lastTs)`, or
        // `AddTicks(1)` were dropped), this would still "work" for THIS
        // specific test shape, so we additionally verify via reflection that
        // the internal buffer holds strictly increasing ts values.
        var buf = typeof(Ring).GetField("_buf", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        var raw = (System.Array)buf.GetValue(r)!;
        // ValueTuple field names are compile-time sugar; at runtime the backing
        // fields are Item1 (ts) / Item2 (value) regardless of the C# names used
        // at the declaration site in Ring.
        var tupleType = raw.GetType().GetElementType()!;
        var item1 = tupleType.GetField("Item1")!;
        DateTime? prev = null;
        var inspected = 0;
        foreach (var item in raw)
        {
            if (item == null) continue;
            var ts = (DateTime)item1.GetValue(item)!;
            if (ts == default) continue; // unfilled slot
            inspected++;
            if (prev.HasValue) Assert.True(ts > prev.Value, $"timestamp {ts:O} did not strictly exceed previous {prev.Value:O}");
            prev = ts;
        }
        Assert.True(inspected >= 3, $"expected to inspect >=3 filled slots, got {inspected}"); // sanity: we actually inspected filled slots
    }

    [Fact]
    public void Constructor_RejectsInvalidCap()
    {
        Assert.Throws<System.OverflowException>(() => new Ring(-1));
    }
}
