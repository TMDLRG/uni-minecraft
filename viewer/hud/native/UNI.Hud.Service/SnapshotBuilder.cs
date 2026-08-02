// SnapshotBuilder.cs — composes the /api/hud/snapshot payload from HudState.

using System.Text.Json;

namespace UNI.Hud.Service;

public static class SnapshotBuilder
{
    public static Dictionary<string, object?> Build(HudState state)
    {
        var mission = state.LastUpstreams.GetValueOrDefault("mission");
        var doorSt  = state.LastUpstreams.GetValueOrDefault("door_state");
        var doorJn  = state.LastUpstreams.GetValueOrDefault("door_journey");
        var console_= state.LastUpstreams.GetValueOrDefault("console");
        var mtx     = state.LastUpstreams.GetValueOrDefault("mediamtx");

        var missionBody = mission?.Body as JsonElement?;
        var missionUp = mission?.Up == true;
        var stack = PollWorker.TryStr(missionBody, "stack");
        var tiles = new Dictionary<string, object?>();
        if (missionBody.HasValue && missionBody.Value.TryGetProperty("tiles", out var tilesEl) && tilesEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var t in tilesEl.EnumerateArray())
            {
                var key = PollWorker.TryStr(t, "key");
                if (key == null) continue;
                tiles[key] = new {
                    up = t.TryGetProperty("up", out var u) ? (u.ValueKind == JsonValueKind.True ? true : u.ValueKind == JsonValueKind.False ? false : (bool?)null) : null,
                    detail = PollWorker.TryStr(t, "detail"),
                };
            }
        }

        // ---- SNAPSHOT FRESHNESS (2026-07-17, gate hud-freshness-honest) ----------------------
        // Computed at REQUEST time, not poll time. This is the fix for three ways a FROZEN snapshot
        // read as live: (1) the poll-stall detector in Enlightened.cs refreshes LastPollAt then
        // checks it in the same pass, so it can never fire; (2) the widget footer showed the EWMA
        // cadence, which deficit-sleeps to a reassuring ~3.0s and freezes there if the loop hangs;
        // (3) last_poll_at was on the wire but rendered nowhere. Build() runs per HTTP request
        // (HttpApiHost calls it fresh each GET), so comparing LastPollAt to now HERE actually
        // observes a stalled loop. Past 3x the MEASURED interval the whole snapshot is stale, and
        // air is forced UNKNOWN (fail-closed: a value we can no longer refresh is not "current").
        var measuredInterval = state.MeasuredIntervalMs ?? 3000.0;
        var pollAgeMs = state.LastPollAt.HasValue
            ? (DateTime.UtcNow - state.LastPollAt.Value).TotalMilliseconds : (double?)null;
        var snapshotStale = pollAgeMs.HasValue && pollAgeMs.Value > 3.0 * measuredInterval;

        // ---- AIR (first-class, honest) -------------------------------------------------------
        // Was: the widget regex-scraped `air=(\w+)` out of the console tile's free-text detail
        // string, and had no way to tell "OFF" from "we don't know". Now sourced from
        // mission.air + mission.airStale. THE RULE: we NEVER fabricate OFF. Absent mission,
        // stale air, or a missing level all render UNKNOWN — the operator sees SYNCING and knows
        // to look, instead of a confident OFF AIR while the show is live.
        var air = BuildAir(missionBody, missionUp);
        // A frozen snapshot must not keep showing the last air level as if current. If the poll
        // loop has stalled, we do not KNOW the air state — say UNKNOWN, not the stale value.
        if (snapshotStale)
            air = new { level = "UNKNOWN", stale = true,
                        source = $"HUD poll loop STALLED — last poll {(long)(pollAgeMs!.Value / 1000)}s ago (> 3x measured {Math.Round(measuredInterval)}ms); air NOT current" };

        // ---- COLONY (full producer-health passthrough) ----------------------------------------
        // mission.colony IS the entire /producer/health body and was on the wire every 3s while
        // the widget string-matched a tile's detail text for it.
        object? colony = null;
        if (missionBody.HasValue && missionBody.Value.TryGetProperty("colony", out var colEl) && colEl.ValueKind == JsonValueKind.Object)
        {
            colony = new {
                verdict       = PollWorker.TryStr(colEl, "verdict"),
                driver        = PollWorker.TryStr(colEl, "driver"),
                star          = PollWorker.TryStr(colEl, "star"),
                last_action   = PollWorker.TryStr(colEl, "last_action"),
                frame         = TryLong(colEl, "frame"),
                colony_count  = TryLong(colEl, "colony_count"),
                tps           = colEl.TryGetProperty("tps", out var tpsEl) && tpsEl.ValueKind == JsonValueKind.Object
                                    ? TryDouble(tpsEl, "tps") : null,
                // Fail closed on every liveness bit: only an EXPLICIT true counts.
                colony_up     = TryTrue(colEl, "colony_up"),
                director_up   = TryTrue(colEl, "director_up"),
                producer_up   = TryTrue(colEl, "producer_up"),
                show_up       = TryTrue(colEl, "show_up"),
                // gate `colony-frozen-needs-dwell-not-one-sample`: how long since the frame counter
                // last MOVED, in wall clock. null = we have not yet observed it (not "stalled").
                // The widget dwell-gates FROZEN on this instead of on an instantaneous Δ of 0,
                // which at this colony's ~0.33fps against a 3.0s poll is pure aliasing noise.
                frame_stalled_ms = state.ColonyFrameLastChangedAt.HasValue
                                    ? (long?)Math.Max(0, (long)(DateTime.UtcNow - state.ColonyFrameLastChangedAt.Value).TotalMilliseconds)
                                    : null,
                source        = "launcher /api/mission .colony (= uni-producer /producer/health)",
            };
        }

        // ---- EGRESS (numeric readers — is the world ACTUALLY being reached) --------------------
        // Straight from the MediaMTX API. Deliberately NOT parsed out of a health detail string:
        // that is the same sin as the air regex. `readers` null (not 0) when MediaMTX is
        // unreachable — 0 means "measured zero", null means "not measured".
        // armed count forwarded by the launcher /api/mission (from the console /api/state) — the
        // denominator for the egress-tile floor. Absent (older launcher) => 0 => floor is max(1,0)=1,
        // i.e. the prior behaviour, never a crash.
        long fanoutArmed = missionBody.HasValue ? (TryLong(missionBody.Value, "fanoutArmed") ?? 0) : 0;
        var egress = BuildEgress(mtx, fanoutArmed);

        // ---- HEALTH CHECKS (the board that was fetched and thrown away) -----------------------
        // console_ was bound at SnapshotBuilder.cs:15 and never referenced — the whole broadcast
        // engineer's board (obs, restreamer, cams, overlays, colonycam, phoenix, fan-out, stream
        // quality) arrived every 3s and was dropped on the floor.
        var healthChecks = new List<object>();
        if (console_?.Body is JsonElement ccBody && ccBody.TryGetProperty("checks", out var checksEl) && checksEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var c in checksEl.EnumerateArray())
            {
                var id = PollWorker.TryStr(c, "id");
                if (id == null) continue;
                healthChecks.Add(new {
                    id,
                    name = PollWorker.TryStr(c, "name"),
                    ok = TryTrue(c, "ok"),   // fail closed
                    detail = PollWorker.TryStr(c, "detail"),
                    fix = PollWorker.TryStr(c, "fix"),
                });
            }
        }

        Dictionary<string, object?>? doorOpen = null;
        if (doorSt?.Body is JsonElement dsBody && dsBody.TryGetProperty("doors", out var doorsEl) && doorsEl.ValueKind == JsonValueKind.Array)
        {
            doorOpen = new();
            foreach (var d in doorsEl.EnumerateArray())
            {
                var key = PollWorker.TryStr(d, "key");
                if (key == null) continue;
                doorOpen[key] = new {
                    open = d.TryGetProperty("open", out var o) && o.ValueKind == JsonValueKind.True,
                    locked = d.TryGetProperty("locked", out var l) && l.ValueKind == JsonValueKind.True,
                    // HONESTY FIX (2026-07-16): was `!present || != False` — a MISSING circle_ok field
                    // defaulted to true (claimed ok with zero evidence). Fail closed like open/locked:
                    // only an EXPLICIT true counts as ok.
                    circle_ok = d.TryGetProperty("circle_ok", out var ck) && ck.ValueKind == JsonValueKind.True,
                    prediction = PollWorker.TryStr(d, "prediction"),
                    label = PollWorker.TryStr(d, "label"),
                    // door_lifecycle.cjs has ALWAYS returned a real href per door; SnapshotBuilder
                    // dropped it, so the widget hardcoded a 5-entry DoorUrls dict (and 9 doors were
                    // unopenable). Passing it through is also what keeps chip-side doors clickable
                    // with NO IP literal in widget code — the server owns the address, always.
                    href = PollWorker.TryStr(d, "href"),
                };
            }
        }

        object? journey_current_step = null;
        if (doorJn?.Body is JsonElement djBody && djBody.TryGetProperty("steps", out var stepsEl) && stepsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var s in stepsEl.EnumerateArray())
            {
                if (PollWorker.TryStr(s, "status") == "current")
                {
                    var predicts = new List<string>();
                    foreach (var s2 in stepsEl.EnumerateArray())
                        if (PollWorker.TryStr(s2, "status") == "pending" && predicts.Count < 3)
                        {
                            var id2 = PollWorker.TryStr(s2, "id");
                            if (id2 != null) predicts.Add(id2);
                        }
                    journey_current_step = new {
                        id = PollWorker.TryStr(s, "id"),
                        label = PollWorker.TryStr(s, "label"),
                        desc = PollWorker.TryStr(s, "desc"),
                        predicts_next = predicts,
                    };
                    break;
                }
            }
        }

        // ---- DRIFT rows (WITH the verdict this time) -------------------------------------------
        // Was: built here from the `gaia_drift` FAST-loop upstream as `new { id = ... }` — the
        // row's NAME and nothing else, the actual documented-vs-observed result discarded. And it
        // never mattered anyway, because that upstream timed out on every poll and this list was
        // permanently empty (see the PollWorker note). Now fed by the slow loop, WITH each row's
        // real `equal`. At the time of writing all 5 are equal=false — a fully-drifting board the
        // HUD was silently rendering as five innocent-looking names.
        var driftRows = state.GaiaDrift.Select(d => (object)new { id = d.id, equal = d.equal }).ToList();

        return new Dictionary<string, object?>
        {
            ["hud"] = new {
                version = "UNI.Hud.Service@0.2",
                port = 8100,
                bind = "127.0.0.1", // matches the ONLY prefixes HttpApiHost actually registers (loopback); do not drift from HttpApiHost.cs's real Prefixes.Add calls again
                uptime_ms = (long)(DateTime.UtcNow - state.StartedAt).TotalMilliseconds,
                poll_count = state.PollCount,
                poll_interval_ms = 3000,                                   // nominal (what we ask for)
                // MEASURED period. These two disagreeing IS the signal: the deployed service
                // advertised 3000 while really running at 11100. Never assert a cadence you
                // haven't measured — publish both and let the gap be visible.
                poll_interval_measured_ms = state.MeasuredIntervalMs.HasValue
                    ? Math.Round(state.MeasuredIntervalMs.Value) : (double?)null,
                last_poll_at = state.LastPollAt?.ToString("O"),
                // 2026-07-17 (gate hud-freshness-honest): the age the widget footer renders as
                // "last poll Ns ago". An age counts UP when the loop hangs (a cadence sits still at
                // its reassuring value) — this is the tell that a snapshot froze while the HTTP
                // listener kept answering.
                last_poll_age_ms = pollAgeMs.HasValue ? (long?)Math.Round(pollAgeMs.Value) : null,
                stale = snapshotStale,
                pid = Environment.ProcessId,
                git_commit = state.GitCommit,
                module_version_id = state.ModuleVersionId,
            },
            ["upstreams"] = state.LastUpstreams.ToDictionary(kv => kv.Key, kv => (object?)new {
                up = kv.Value.Up, status = kv.Value.Status, latencyMs = kv.Value.LatencyMs,
                err = kv.Value.Err, url = kv.Value.Url,
            }),
            ["stack"] = new { state = stack, source = "launcher /api/mission .stack" },
            ["journey_current_step"] = journey_current_step,
            ["door_open"] = doorOpen,
            ["studio_ports"] = tiles,
            ["gates"] = state.GatesCache,
            ["air"] = air,
            ["colony"] = colony,
            ["egress"] = egress,
            ["health_checks"] = healthChecks,
            ["gaia"] = new {
                seats = state.GaiaSeats,
                polled_at = state.GaiaPolledAt?.ToString("O"),
                err = state.GaiaErr,
                // The widget must not have to know Gaia's address. Same law as door hrefs.
                href = "http://127.0.0.1:8096/gaia",
            },
            ["drift"] = driftRows,
            ["audience"] = new { size = state.Audience.Size, cap = state.Audience.Cap, recent_count = Math.Min(20, state.Audience.Size) },
            ["metrics"] = new {
                // Continuous magnitudes ONLY. The retired `producer_up` was a 0/1 binary drawn as a
                // line chart with fixed min=0/max=1 — structurally incapable of showing anything but
                // a flat line. `launcher_latency_ms` measured the HUD's OWN poll round-trip, i.e. its
                // plumbing, not the broadcast; both are gone from the surface (gate:
                // hud-speeds-meaningful). Latency rings survive in HudState as internal diagnostics.
                colony_frame_rate = state.ColonyFrameRateRing.Sparkline(120),
                output_fps        = state.OutputFpsRing.Sparkline(120),
                congestion        = state.CongestionRing.Sparkline(120),
                dropped_pct       = state.DroppedPctRing.Sparkline(120),
                egress_readers    = state.EgressReadersRing.Sparkline(120),
                tps               = state.TpsRing.Sparkline(120),
                stack             = state.StackRing.Sparkline(120),
                audience_count    = state.AudienceCountRing.Sparkline(120),
            },
            ["sight"] = state.LastSight,
        };
    }

    // AIR, honest-by-construction. The ONLY place air is decided.
    internal static object BuildAir(JsonElement? missionBody, bool missionUp)
    {
        // No mission at all => we know NOTHING about air. Not OFF. UNKNOWN.
        if (!missionUp || !missionBody.HasValue || !missionBody.Value.TryGetProperty("air", out var a) || a.ValueKind != JsonValueKind.Object)
            return new { level = "UNKNOWN", stale = true, source = "mission unreachable — air NOT measured (never fabricate OFF)" };

        // airStale=true means the console handed us its fabricated {level:"OFF",program:"?"}
        // fallback because OBS truth was unavailable. That OFF is a placeholder, not a measurement.
        var stale = missionBody.Value.TryGetProperty("airStale", out var st) && st.ValueKind == JsonValueKind.True;
        var level = PollWorker.TryStr(a, "level");
        if (stale || string.IsNullOrEmpty(level))
            return new { level = "UNKNOWN", stale = true, program = PollWorker.TryStr(a, "program"),
                         source = "console reported air STALE (OBS truth unavailable) — the OFF it sent is a placeholder" };

        return new {
            level,                                    // LIVE_LIVE / STREAMING_DARK / REHEARSAL / OFF — real
            stale = false,
            streaming  = TryTrue(a, "streaming"),
            visible    = TryTrue(a, "visible"),       // human CAMS only — NOT a picture measurement
            audible    = TryTrue(a, "audible"),
            // 2026-07-17 (88-agent HUD sweep, blocker #1): `visible` counts human cameras, so the
            // flagship colony show (no camera, by design) computed visible=false forever and the
            // badge sat green and invariant while the world could have been watching black. The
            // console now derives PICTURE from program sources minus chrome; carry it through, or
            // this builder silently drops the whole fix — it enumerates fields, it does not splat.
            pictureOnProgram = TryTrue(a, "pictureOnProgram"),
            // Carried VERBATIM. It arrives already fenced ("source-enablement, NOT a pixel
            // measurement"). Never re-word a measured claim into a stronger one.
            pictureNote = PollWorker.TryStr(a, "pictureNote"),
            program    = PollWorker.TryStr(a, "program"),
            timecode   = PollWorker.TryStr(a, "timecode"),
            congestion = TryDouble(a, "congestion"),
            skipped    = TryLong(a, "skipped"),
            frames     = TryLong(a, "frames"),
            source     = "launcher /api/mission .air (+ .airStale)",
        };
    }

    // EGRESS from the MediaMTX API. readers==null means NOT MEASURED; 0 means measured zero.
    // `armed` (2026-07-17, gate egress-armed-floor-always-on) is the count of pushers the console
    // ARMED, forwarded via launcher /api/mission. The widget floors readers >= max(1, armed) so a
    // green egress tile can no longer sit at 1 reader while a second armed platform is dark.
    internal static object BuildEgress(UpstreamResult? mtx, long armed)
    {
        if (mtx?.Body is not JsonElement m || m.ValueKind != JsonValueKind.Object ||
            !m.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
            return new { readers = (long?)null, ready = (bool?)null, armed,
                         source = "MediaMTX :9997 unreachable — egress NOT measured" };

        foreach (var it in items.EnumerateArray())
        {
            if (PollWorker.TryStr(it, "name") != "uni") continue;
            long? readers = it.TryGetProperty("readers", out var r) && r.ValueKind == JsonValueKind.Array
                ? r.GetArrayLength() : null;
            return new {
                readers,                       // THE number that says the world is actually reached
                ready = TryTrue(it, "ready"),  // is anything publishing into uni at all
                armed,                         // how many pushers should be pulling (the floor)
                source = "MediaMTX :9997/v3/paths/list items[name=uni].readers.length",
            };
        }
        // MediaMTX answered and has no `uni` path: a real measurement of zero.
        return new { readers = (long?)0, ready = (bool?)false, armed, source = "MediaMTX :9997 — no `uni` path (measured)" };
    }

    // Gaia wraps each drift comparison's payload as a JSON-ENCODED STRING in value.raw
    // (NOT a nested object — reading `value.raw.equal` directly yields undefined for every row).
    internal static (bool? equal, string? relation) ParseDriftRaw(JsonElement sig)
    {
        try
        {
            if (!sig.TryGetProperty("value", out var v) || !v.TryGetProperty("raw", out var raw) ||
                raw.ValueKind != JsonValueKind.String) return (null, null);
            var inner = JsonSerializer.Deserialize<JsonElement>(raw.GetString()!);
            if (inner.ValueKind != JsonValueKind.Object) return (null, null);
            bool? eq = inner.TryGetProperty("equal", out var e)
                ? (e.ValueKind == JsonValueKind.True ? true : e.ValueKind == JsonValueKind.False ? false : (bool?)null)
                : null;
            return (eq, PollWorker.TryStr(inner, "relation"));
        }
        catch { return (null, null); }  // unparseable => UNKNOWN, never a fabricated pass
    }

    internal static bool TryTrue(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.True;

    internal static long? TryLong(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) &&
        v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) ? n : null;

    internal static double? TryDouble(JsonElement el, string key) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) &&
        v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) ? d : null;
}
