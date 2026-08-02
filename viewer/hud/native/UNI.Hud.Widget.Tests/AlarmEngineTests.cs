// AlarmEngineTests.cs — THE ONE CHANGE, as tests (gate air-alarm-annunciates). The alarm's whole
// value is that it fires when the world goes dark AND stays silent otherwise; both halves are pinned
// here. The false-alarm cases are the load-bearing ones — an alarm that cries wolf gets ignored.

using UNI.Hud.Widget;

namespace UNI.Hud.Widget.Tests;

public class AlarmEngineTests
{
    private static AlarmFacts OffAir() => new() { StreamingKnownOff = true, Readers = 0 };
    private static AlarmFacts Live(long? readers) => new() { StreamingFresh = true, Readers = readers };

    // ---- SILENCE (the load-bearing half) -----------------------------------------------------------

    [Fact] // idle / off air: never armed, never fires — even with readers 0.
    public void OffAir_IsSilent()
    {
        var e = new AlarmEngine();
        var d = e.Update(OffAir(), 0);
        Assert.False(d.Armed);
        Assert.Empty(d.Firing);
        Assert.False(d.PlaySound);
    }

    [Fact] // the G-PA ARM-before-CONFIRM window: fan-out armed, readers 0, but NOT streaming yet.
           // pushers flap by design here — the alarm must be dead silent.
    public void ArmBeforeConfirm_IsSilent()
    {
        var e = new AlarmEngine();
        // not streaming (StreamingKnownOff), readers 0, a flapping fanout row present
        var d = e.Update(new AlarmFacts { StreamingKnownOff = true, Readers = 0, KeyRejectedRow = false }, 1000);
        Assert.False(d.Armed);
        Assert.Empty(d.Firing);
    }

    [Fact] // live and healthy (readers present): armed, but nothing fires.
    public void LiveHealthy_ArmedButSilent()
    {
        var e = new AlarmEngine();
        var d = e.Update(Live(2), 0);
        Assert.True(d.Armed);
        Assert.Empty(d.Firing);
        Assert.False(d.PlaySound);
    }

    [Fact] // readers==null is NOT MEASURED — a MediaMTX blip must never fire EgressCollapse.
    public void ReadersNull_NeverFiresEgress()
    {
        var e = new AlarmEngine();
        e.Update(Live(null), 0);
        var d = e.Update(Live(null), 60_000);
        Assert.DoesNotContain(AlarmCode.EgressCollapse, d.Firing);
    }

    [Fact] // EgressCollapse needs the 30s dwell — a brief readers==0 (the respawn gap) does not fire.
    public void EgressCollapse_RequiresDwell()
    {
        var e = new AlarmEngine();
        e.Update(Live(0), 0);
        var early = e.Update(Live(0), 10_000);          // 10s < 30s dwell
        Assert.DoesNotContain(AlarmCode.EgressCollapse, early.Firing);
        var late = e.Update(Live(0), 31_000);           // past dwell
        Assert.Contains(AlarmCode.EgressCollapse, late.Firing);
        Assert.True(late.PlaySound);
    }

    // ---- FIRE (the reason it exists) ---------------------------------------------------------------

    [Fact] // the walk-away catch: live, and nobody is pulling the program for 30s.
    public void EgressCollapse_Fires_AfterDwell()
    {
        var e = new AlarmEngine();
        e.Update(Live(1), 0);                            // healthy
        e.Update(Live(0), 5_000);                        // readers drop to 0
        var d = e.Update(Live(0), 40_000);               // held past dwell
        Assert.Contains(AlarmCode.EgressCollapse, d.Firing);
    }

    [Fact] // KEY REJECTED fires immediately — its health row is already uniReady+flap gated upstream.
    public void KeyRejected_Fires()
    {
        var e = new AlarmEngine();
        var d = e.Update(new AlarmFacts { StreamingFresh = true, Readers = 1, KeyRejectedRow = true }, 0);
        Assert.Contains(AlarmCode.KeyRejected, d.Firing);
        Assert.True(d.PlaySound);
    }

    [Fact] // BLIND: the snapshot stalled while armed. Losing sight while live is itself an alarm.
    public void Blind_Fires_WhileArmed()
    {
        var e = new AlarmEngine();
        e.Update(Live(2), 0);                            // arm
        var d = e.Update(new AlarmFacts { Blind = true }, 3_000);  // now blind, air unknown
        Assert.True(d.Armed);                            // NOT disarmed by lost sight
        Assert.Contains(AlarmCode.Blind, d.Firing);
    }

    // ---- LATCH honesty -----------------------------------------------------------------------------

    [Fact] // UNKNOWN air must NEVER disarm the latch (fail-closed).
    public void Unknown_DoesNotDisarm()
    {
        var e = new AlarmEngine();
        e.Update(Live(2), 0);
        Assert.True(e.Update(new AlarmFacts { /* all false = unknown */ }, 1000).Armed);
    }

    [Fact] // a MEASURED off DOES disarm and clears state.
    public void MeasuredOff_Disarms()
    {
        var e = new AlarmEngine();
        e.Update(Live(0), 0);
        e.Update(Live(0), 40_000);                       // firing egress
        var d = e.Update(OffAir(), 41_000);              // measured off
        Assert.False(d.Armed);
        Assert.Empty(d.Firing);
    }

    // ---- ACK --------------------------------------------------------------------------------------

    [Fact] // ACK silences the SOUND for 10 min but never clears the badge (firing stays true).
    public void Ack_SilencesSound_NotBadge()
    {
        var e = new AlarmEngine();
        e.Update(Live(1), 0);
        e.Update(Live(0), 5_000);                        // readers drop -> dwell starts at 5s
        var d = e.Update(Live(0), 40_000);               // 35s held >= 30s dwell: egress firing, sound on
        Assert.True(d.PlaySound);
        Assert.True(e.Ack(AlarmCode.EgressCollapse, 40_000, d));
        var d2 = e.Update(Live(0), 50_000);              // still within ack window
        Assert.Contains(AlarmCode.EgressCollapse, d2.Firing);  // badge STILL red
        Assert.False(d2.PlaySound);                      // but sound silenced
    }

    [Fact] // ACK auto-expires: the sound returns after the 10-min window if still firing.
    public void Ack_Expires_SoundReturns()
    {
        var e = new AlarmEngine();
        e.Update(Live(1), 0);
        e.Update(Live(0), 5_000);                        // dwell starts at 5s
        var d = e.Update(Live(0), 40_000);               // firing
        Assert.True(e.Ack(AlarmCode.EgressCollapse, 40_000, d));
        var later = e.Update(Live(0), 40_000 + AlarmEngine.ACK_SILENCE_MS + 1000);
        Assert.True(later.PlaySound);                    // silence expired, alarm re-sounds
    }

    [Fact] // ACK refuses to silence a code that is not firing.
    public void Ack_RefusesNonFiring()
    {
        var e = new AlarmEngine();
        var d = e.Update(Live(2), 0);                    // healthy, nothing firing
        Assert.False(e.Ack(AlarmCode.KeyRejected, 0, d));
    }
}
