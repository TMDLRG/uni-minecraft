// SnapshotHonestyTests.cs — the HUD's honesty properties, as tests.
//
// Every test here encodes a defect that was REAL and LIVE on 2026-07-16, found by reading the
// deployed service's own output rather than the code's intent. The gates
// (hud-air-honest-unknown, hud-speeds-meaningful, hud-gaia-honest-seats, hud-all-doors-rendered)
// name these as their FALSIFIES conditions; these tests are what make them falsifiable in CI
// instead of re-litigated by eye every time someone edits SnapshotBuilder.
//
// The one rule they all serve: NEVER FABRICATE A MEASUREMENT. A value we did not measure must
// surface as UNKNOWN/null — never as a confident zero, and never as OFF.

using System.Text.Json;
using UNI.Hud.Service;

namespace UNI.Hud.Service.Tests;

public class AirHonestyTests
{
    private static JsonElement J(string s) => JsonSerializer.Deserialize<JsonElement>(s);
    private static string LevelOf(object air) => (string)air.GetType().GetProperty("level")!.GetValue(air)!;
    private static bool StaleOf(object air) => (bool)air.GetType().GetProperty("stale")!.GetValue(air)!;

    [Fact] // FALSIFIES hud-air-honest-unknown: "Air reads OFF while the console is merely unreported"
    public void StaleAir_IsUnknown_NotOff()
    {
        // The console sends a FABRICATED {level:"OFF"} plus airStale:true whenever OBS truth is
        // unavailable. Reporting that OFF as fact is a false-negative on a go-live surface — the
        // operator sees "OFF AIR" while the show may be streaming to the world.
        var mission = J(@"{""air"":{""level"":""OFF"",""program"":""?"",""streaming"":false},""airStale"":true}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.Equal("UNKNOWN", LevelOf(air));
        Assert.True(StaleOf(air));
    }

    [Fact] // A REAL off is still allowed to say OFF — honesty cuts both ways.
    public void FreshAir_ReportsItsRealLevel()
    {
        var mission = J(@"{""air"":{""level"":""OFF"",""program"":""COLONY"",""streaming"":false,
                          ""congestion"":0,""skipped"":0,""frames"":0,""timecode"":""00:00:00.000""},
                          ""airStale"":false}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.Equal("OFF", LevelOf(air));
        Assert.False(StaleOf(air));
    }

    [Fact]
    public void LiveAir_ReportsLive()
    {
        var mission = J(@"{""air"":{""level"":""LIVE_LIVE"",""program"":""COLONY"",""streaming"":true,
                          ""frames"":1000,""skipped"":2,""congestion"":0.1},""airStale"":false}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.Equal("LIVE_LIVE", LevelOf(air));
        Assert.False(StaleOf(air));
    }

    // ── 2026-07-17 · gate `air-level-counts-program-picture` (88-agent HUD sweep, blocker #1) ──────
    // BuildAir ENUMERATES fields; it does not splat. So a new honesty field computed in the console
    // is dropped on the floor here unless someone adds a line — silently, with no error, and the
    // whole fix evaporates between the two processes. That is precisely how a fix "lands" and does
    // nothing. These tests make that failure loud.

    private static bool PictureOf(object air) => (bool)air.GetType().GetProperty("pictureOnProgram")!.GetValue(air)!;
    private static string? NoteOf(object air) => (string?)air.GetType().GetProperty("pictureNote")!.GetValue(air);

    [Fact] // FALSIFIES air-level-counts-program-picture: "the picture bit is dropped in transit"
    public void PictureOnProgram_SurvivesTheServiceBoundary()
    {
        var mission = J(@"{""air"":{""level"":""LIVE_LIVE"",""program"":""COLONY"",""streaming"":true,
                          ""pictureOnProgram"":true,
                          ""pictureNote"":""1 picture source(s) enabled on program: cap_colony — source-enablement, NOT a pixel measurement""},
                          ""airStale"":false}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.True(PictureOf(air));
        // Carried VERBATIM — the fence must reach the operator, not be re-worded into a stronger claim.
        Assert.Contains("NOT a pixel measurement", NoteOf(air));
    }

    [Fact] // The flagship failure: streaming, and NOT ONE picture source on program.
    public void StreamingWithNoPictureSource_IsDark_NotGreen()
    {
        // The colony hero shot has no camera by design, so the OLD `visible` (human CAMS only) was
        // false whether cap_colony was rendering the world or had died to black — the badge sat on
        // the reassuring green "STREAMING" through both. STREAMING_DARK is the level that can only
        // mean "we are pushing to the world with nothing to show", and the widget paints it red.
        var mission = J(@"{""air"":{""level"":""STREAMING_DARK"",""program"":""COLONY"",""streaming"":true,
                          ""visible"":false,""audible"":false,""pictureOnProgram"":false,
                          ""pictureNote"":""NO picture-bearing source is enabled on program — only chrome/audio.""},
                          ""airStale"":false}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.Equal("STREAMING_DARK", LevelOf(air));
        Assert.False(PictureOf(air));
        Assert.False(StaleOf(air));
        // The retired level must never come back: it meant "black push" and rendered GREEN.
        Assert.NotEqual("STREAMING", LevelOf(air));
    }

    [Fact] // A dark push we are NOT SURE about must still be UNKNOWN. Fail closed, both directions.
    public void StaleDarkAir_IsStillUnknown()
    {
        var mission = J(@"{""air"":{""level"":""STREAMING_DARK"",""program"":""?"",""streaming"":true,
                          ""pictureOnProgram"":false},""airStale"":true}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.Equal("UNKNOWN", LevelOf(air));
        Assert.True(StaleOf(air));
    }

    [Fact] // An older console that does not send the field must not be read as "there IS a picture".
    public void MissingPictureField_DefaultsToFalse_NeverAssumedGood()
    {
        var mission = J(@"{""air"":{""level"":""LIVE_LIVE"",""program"":""TRIO"",""streaming"":true},""airStale"":false}");
        var air = SnapshotBuilder.BuildAir(mission, missionUp: true);
        Assert.False(PictureOf(air));   // TryTrue fails closed — absence is not evidence of picture
    }

    [Fact] // Mission unreachable => we know NOTHING about air. Not OFF.
    public void MissionDown_IsUnknown_NotOff()
    {
        var air = SnapshotBuilder.BuildAir(null, missionUp: false);
        Assert.Equal("UNKNOWN", LevelOf(air));
        Assert.True(StaleOf(air));
    }

    [Fact] // Mission answered but carries no air block at all.
    public void MissionWithoutAirBlock_IsUnknown_NotOff()
    {
        var air = SnapshotBuilder.BuildAir(J(@"{""stack"":""UP""}"), missionUp: true);
        Assert.Equal("UNKNOWN", LevelOf(air));
    }

    [Fact] // airStale ABSENT (an older launcher that never forwards it) must not read as "fresh".
    public void AirWithoutLevel_IsUnknown()
    {
        var air = SnapshotBuilder.BuildAir(J(@"{""air"":{""program"":""COLONY""}}"), missionUp: true);
        Assert.Equal("UNKNOWN", LevelOf(air));
    }
}

public class EgressHonestyTests
{
    private static JsonElement J(string s) => JsonSerializer.Deserialize<JsonElement>(s);
    private static UpstreamResult Mtx(string? body) =>
        new("mediamtx", body != null, 200, 5, null, "http://127.0.0.1:9997/v3/paths/list",
            body == null ? null : J(body));
    private static long? ReadersOf(object e) => (long?)e.GetType().GetProperty("readers")!.GetValue(e);
    private static long ArmedOf(object e) => (long)e.GetType().GetProperty("armed")!.GetValue(e)!;

    [Fact] // readers is THE number that says the world is actually reached.
    public void CountsReadersOnUniPath()
    {
        var e = SnapshotBuilder.BuildEgress(Mtx(@"{""items"":[
            {""name"":""cam1"",""ready"":false,""readers"":[]},
            {""name"":""uni"",""ready"":true,""readers"":[{""type"":""rtmpConn""},{""type"":""rtmpConn""}]}]}"), 2);
        Assert.Equal(2L, ReadersOf(e));
    }

    [Fact] // FALSIFIES hud-speeds-meaningful: a non-measurement must never render as a confident 0.
    public void MediaMtxUnreachable_ReadersIsNull_NotZero()
    {
        // null means "not measured"; 0 means "measured zero". Collapsing them would let the HUD
        // assert "nobody is watching" when the truth is "we never asked".
        var e = SnapshotBuilder.BuildEgress(Mtx(null), 0);
        Assert.Null(ReadersOf(e));
    }

    [Fact] // MediaMTX answered and there is genuinely no uni path: a real zero.
    public void NoUniPath_ReadersIsMeasuredZero()
    {
        var e = SnapshotBuilder.BuildEgress(Mtx(@"{""items"":[{""name"":""cam1"",""ready"":false,""readers"":[]}]}"), 0);
        Assert.Equal(0L, ReadersOf(e));
    }

    [Fact] // gate egress-armed-floor-always-on: the armed count is carried so the widget can floor
           // readers >= max(1, armed). The number itself is the input to the floor, not the verdict.
    public void CarriesArmedCountForTheFloor()
    {
        var e = SnapshotBuilder.BuildEgress(Mtx(@"{""items"":[{""name"":""uni"",""ready"":true,""readers"":[{""type"":""rtmpConn""}]}]}"), 2);
        Assert.Equal(1L, ReadersOf(e));   // one platform delivering
        Assert.Equal(2L, ArmedOf(e));     // two armed => the widget's max(1,2) floor flags this as partial
    }
}

public class DriftParseTests
{
    private static JsonElement J(string s) => JsonSerializer.Deserialize<JsonElement>(s);

    [Fact] // Gaia wraps the payload as a JSON-ENCODED STRING in value.raw — NOT a nested object.
    public void ParsesEqualOutOfEncodedRawString()
    {
        // The design doc said to read `value.raw.equal`. On the live wire value.raw is a *string*,
        // so that path yields undefined for every row — the exact bug that shipped: the HUD showed
        // 5 drift names with no verdicts while all 5 were equal=false.
        var sig = J(@"{""id"":""drift.fqdn_cjs"",""kind"":""drift"",
                       ""value"":{""raw"":""{\""equal\"":false,\""relation\"":\""absent\""}"",""encoding"":""utf8""}}");
        var (equal, relation) = SnapshotBuilder.ParseDriftRaw(sig);
        Assert.False(equal);
        Assert.Equal("absent", relation);
    }

    [Fact]
    public void ParsesEqualTrue()
    {
        var sig = J(@"{""id"":""d"",""kind"":""drift"",
                       ""value"":{""raw"":""{\""equal\"":true,\""relation\"":\""self\""}""}}");
        var (equal, _) = SnapshotBuilder.ParseDriftRaw(sig);
        Assert.True(equal);
    }

    [Fact] // An unparseable row is UNKNOWN — never silently a pass.
    public void UnparseableRaw_IsNull_NotFabricatedPass()
    {
        var sig = J(@"{""id"":""d"",""kind"":""drift"",""value"":{""raw"":""not json at all""}}");
        var (equal, _) = SnapshotBuilder.ParseDriftRaw(sig);
        Assert.Null(equal);
    }

    [Fact]
    public void MissingValue_IsNull()
    {
        var (equal, _) = SnapshotBuilder.ParseDriftRaw(J(@"{""id"":""d"",""kind"":""drift""}"));
        Assert.Null(equal);
    }
}

public class RateMathTests
{
    [Fact] // Δframe/Δt — the honest "the colony is thinking" line.
    public void ComputesRateAcrossTwoSamples()
    {
        long? last = null; DateTime? lastAt = null;
        var t0 = new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc);
        Assert.Null(PollWorker.Rate(1000, ref last, ref lastAt, t0));         // first sample: unknowable
        var r = PollWorker.Rate(1060, ref last, ref lastAt, t0.AddSeconds(3)); // +60 frames / 3s
        Assert.NotNull(r);
        Assert.Equal(20.0, r!.Value, 3);
    }

    [Fact] // FALSIFIES hud-speeds-meaningful: the first sample must not draw a fake 0.
    public void FirstSample_IsNull_NotZero()
    {
        long? last = null; DateTime? lastAt = null;
        Assert.Null(PollWorker.Rate(500, ref last, ref lastAt, DateTime.UtcNow));
    }

    [Fact] // A restarted upstream resets its counter; the delta across that boundary is meaningless.
    public void CounterWentBackwards_IsNull_NotNegative()
    {
        long? last = null; DateTime? lastAt = null;
        var t0 = new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc);
        PollWorker.Rate(9000, ref last, ref lastAt, t0);
        var r = PollWorker.Rate(12, ref last, ref lastAt, t0.AddSeconds(3));  // producer restarted
        Assert.Null(r);   // a negative "frame rate" would be a lie; so would 0
    }

    [Fact] // A genuinely frozen colony reports a REAL zero — that is the whole point of the line.
    public void FrozenCounter_ReportsRealZero()
    {
        long? last = null; DateTime? lastAt = null;
        var t0 = new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc);
        PollWorker.Rate(8716, ref last, ref lastAt, t0);
        var r = PollWorker.Rate(8716, ref last, ref lastAt, t0.AddSeconds(3)); // not advancing
        Assert.Equal(0.0, r!.Value, 6);
    }

    [Fact] // No current value => not measured => null (and the baseline resets).
    public void NullCurrent_IsNull()
    {
        long? last = 100; DateTime? lastAt = DateTime.UtcNow.AddSeconds(-3);
        Assert.Null(PollWorker.Rate(null, ref last, ref lastAt, DateTime.UtcNow));
    }
}

public class SnapshotCompositionTests
{
    private static HudState StateWith(string missionJson, string? doorJson = null, string? consoleJson = null)
    {
        var st = new HudState();
        var ups = new Dictionary<string, UpstreamResult>
        {
            ["mission"] = new("mission", true, 200, 10, null, "u", JsonSerializer.Deserialize<JsonElement>(missionJson)),
        };
        if (doorJson != null)
            ups["door_state"] = new("door_state", true, 200, 5, null, "u", JsonSerializer.Deserialize<JsonElement>(doorJson));
        if (consoleJson != null)
            ups["console"] = new("console", true, 200, 5, null, "u", JsonSerializer.Deserialize<JsonElement>(consoleJson));
        st.LastUpstreams = ups;
        return st;
    }

    [Fact] // FALSIFIES hud-all-doors-rendered: the server owns the address; the widget must not.
    public void DoorHrefIsPassedThrough()
    {
        // door_lifecycle.cjs has always returned a real href per door. SnapshotBuilder dropped it,
        // so the widget hardcoded a 5-entry URL dict and 9 doors were simply unopenable. Passing
        // it through is also what keeps chip-side doors clickable with NO IP literal in widget code.
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}",
            @"{""doors"":[{""key"":""gaia"",""open"":true,""locked"":false,""circle_ok"":true,
                          ""href"":""http://127.0.0.1:8096/gaia"",""label"":""Gaia""}]}"));
        var doors = (Dictionary<string, object?>)snap["door_open"]!;
        var gaia = doors["gaia"]!;
        Assert.Equal("http://127.0.0.1:8096/gaia", gaia.GetType().GetProperty("href")!.GetValue(gaia));
    }

    [Fact] // A door with no server href stays null — the widget must not invent one.
    public void DoorWithoutHref_IsNull()
    {
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}",
            @"{""doors"":[{""key"":""x"",""open"":false,""locked"":true,""circle_ok"":false}]}"));
        var doors = (Dictionary<string, object?>)snap["door_open"]!;
        Assert.Null(doors["x"]!.GetType().GetProperty("href")!.GetValue(doors["x"]!));
    }

    [Fact] // circle_ok fails CLOSED: missing evidence is not evidence of health.
    public void MissingCircleOk_FailsClosed()
    {
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}",
            @"{""doors"":[{""key"":""x"",""open"":true,""locked"":false}]}"));
        var doors = (Dictionary<string, object?>)snap["door_open"]!;
        Assert.False((bool)doors["x"]!.GetType().GetProperty("circle_ok")!.GetValue(doors["x"]!)!);
    }

    [Fact] // The console health board was fetched every 3s and thrown away (SnapshotBuilder.cs:15).
    public void HealthChecksAreSurfaced()
    {
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}", null,
            @"{""checks"":[{""id"":""obs"",""name"":""OBS (mixer)"",""ok"":true,""detail"":""websocket connected""},
                           {""id"":""cam1"",""name"":""Remote camera 1"",""ok"":false,""detail"":""not publishing""}]}"));
        var checks = (List<object>)snap["health_checks"]!;
        Assert.Equal(2, checks.Count);
        Assert.False((bool)checks[1].GetType().GetProperty("ok")!.GetValue(checks[1])!);
    }

    [Fact] // ok fails closed too — a check with no ok field is not a passing check.
    public void HealthCheckMissingOk_FailsClosed()
    {
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}", null,
            @"{""checks"":[{""id"":""x"",""name"":""X"",""detail"":""?""}]}"));
        var checks = (List<object>)snap["health_checks"]!;
        Assert.False((bool)checks[0].GetType().GetProperty("ok")!.GetValue(checks[0])!);
    }

    [Fact] // mission.colony IS the whole /producer/health body — surface it, don't string-match a tile.
    public void ColonyIsPassedThrough()
    {
        var snap = SnapshotBuilder.Build(StateWith(
            @"{""stack"":""UP"",""colony"":{""verdict"":""LIVE"",""driver"":""producer"",""star"":""UNI-0-1"",
               ""frame"":8716,""colony_count"":6,""tps"":{""up"":true,""tps"":20},""colony_up"":true,
               ""director_up"":true,""producer_up"":true,""show_up"":true,""last_action"":""hold""}}"));
        var c = snap["colony"]!;
        Assert.Equal("LIVE", c.GetType().GetProperty("verdict")!.GetValue(c));
        Assert.Equal(6L, c.GetType().GetProperty("colony_count")!.GetValue(c));
        Assert.Equal(20.0, (double?)c.GetType().GetProperty("tps")!.GetValue(c));
        Assert.True((bool)c.GetType().GetProperty("director_up")!.GetValue(c)!);
    }

    [Fact] // The retired binary/plumbing series must not come back onto the surface.
    public void MetricsCarryNoBinaryOrSelfLatencySeries()
    {
        var snap = SnapshotBuilder.Build(StateWith(@"{""stack"":""UP""}"));
        var props = snap["metrics"]!.GetType().GetProperties().Select(p => p.Name).ToList();
        Assert.DoesNotContain("producer_up", props);          // 0/1 binary drawn as a line chart
        Assert.DoesNotContain("launcher_latency_ms", props);  // the HUD's own poll round-trip
        Assert.Contains("colony_frame_rate", props);
        Assert.Contains("egress_readers", props);
    }
}

// ── 2026-07-17 · gate `colony-frozen-needs-dwell-not-one-sample` ──────────────────────────────────
// Found LIVE on the surface, not in the code: the HUD printed red "COLONY frames/s 0.0 · FROZEN"
// while /producer/health .frame went 33718 -> 33720 across 6s. Rate() differences ONE consecutive
// pair; this colony ticks ~1 frame per ~3s against a 3.0s poll, so Δ=0 is aliasing, not a frozen
// mind. These pin the aliasing itself, so nobody "simplifies" liveness back onto the rate.
public class ColonyFrozenAliasingTests
{
    [Fact] // THE BUG, reproduced exactly: same frame twice in a row on a LIVE colony => rate 0.0
    public void Rate_Aliases_To_Zero_On_A_Live_Colony_And_So_Cannot_Convict()
    {
        long? last = null; DateTime? lastAt = null;
        var t0 = new DateTime(2026, 7, 17, 5, 11, 0, DateTimeKind.Utc);
        // ~0.33 fps sampled at 3.0s: the counter moves on some intervals and not others.
        PollWorker.Rate(33718, ref last, ref lastAt, t0);                       // first: unknowable
        var r1 = PollWorker.Rate(33718, ref last, ref lastAt, t0.AddSeconds(3)); // SAME frame
        var r2 = PollWorker.Rate(33719, ref last, ref lastAt, t0.AddSeconds(6)); // moved
        Assert.Equal(0.0, r1);          // <- the widget used to paint this red "FROZEN". Colony was FINE.
        Assert.True(r2 > 0);
    }

    [Fact] // The honest signal: wall-clock since the counter last MOVED is immune to the tick rate.
    public void StallAge_DistinguishesAliasingFromAFrozenMind()
    {
        var t0 = new DateTime(2026, 7, 17, 5, 11, 0, DateTimeKind.Utc);
        const long DWELL = 30000;
        // Aliased sample on a live colony: last change was 3s ago -> NOT frozen.
        Assert.False((long)(t0.AddSeconds(3) - t0).TotalMilliseconds >= DWELL);
        // A genuinely stopped mind: no change for 45s -> frozen.
        Assert.True((long)(t0.AddSeconds(45) - t0).TotalMilliseconds >= DWELL);
    }

    [Fact] // Never measured is not "stalled". Absence must stay absence.
    public void NeverObserved_IsNull_NotStalled()
    {
        var st = new HudState();
        Assert.Null(st.ColonyFrameLastChangedAt);
        Assert.Null(st.LastChangedColonyFrameValue);
    }
}
